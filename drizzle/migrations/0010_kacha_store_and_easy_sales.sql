-- 1) Sales are easier to enter: rate can be left blank (0) and filled later; favourite customers.
-- 2) Nakad Bikri no longer gets a hidden automatic receipt: when saving, the owner is asked how much was received
--    (full, a custom amount, or nothing) and can give a discount. That money is an ordinary receipt of the sale.
-- 3) Rehra loads say what was carried (bricks or 9t tiles) and where from (a patheer, or the kacha store).
--    The kacha store holds dry, unbaked bricks stacked for later: from patheers, from an outsource supplier
--    (only the count is recorded, not the payment), an opening count, or a correction.

-- ====== Sales ======
alter table public.parties add column if not exists is_favourite boolean not null default false;
alter table public.sale_items drop constraint if exists sale_items_rate_per_1000_check;
do $c$ begin
  alter table public.sale_items add constraint sale_items_rate_not_negative check (rate_per_1000 >= 0);
exception when duplicate_object then null; end $c$;

-- No more automatic Nakad receipts. Receipts it already made stay as ordinary, editable receipts of their sale.
drop trigger if exists sync_cash_sale on public.sales;
drop trigger if exists sync_cash_sale on public.sale_items;

-- Money received at the sale is recorded for every customer, Nakad Bikri included.
create or replace function public.create_sale(
  _entry_date date, _customer_id uuid, _vehicle_no text, _driver_name text, _discount bigint, _delivery bigint,
  _note text, _items jsonb, _paid bigint, _method public.pay_method, _handler uuid
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  sid uuid;
  it jsonb;
  gross bigint := 0;
  u text;
begin
  if _items is null or jsonb_array_length(_items) = 0 then raise exception 'Invoice needs at least one line'; end if;
  insert into public.sales (entry_date, customer_id, vehicle_no, driver_name, discount, delivery_charges, note, created_by)
  values (_entry_date, _customer_id, nullif(btrim(_vehicle_no), ''), nullif(btrim(_driver_name), ''),
          coalesce(_discount, 0), coalesce(_delivery, 0), nullif(btrim(_note), ''), auth.uid())
  returning id into sid;
  for it in select * from jsonb_array_elements(_items) loop
    insert into public.sale_items (sale_id, quality_id, quantity, rate_per_1000, created_by)
    values (sid, (it ->> 'quality_id')::uuid, (it ->> 'quantity')::bigint, coalesce((it ->> 'rate_per_1000')::bigint, 0), auth.uid());
    select unit into u from public.qualities where id = (it ->> 'quality_id')::uuid;
    gross := gross + public.line_amount((it ->> 'quantity')::bigint, coalesce((it ->> 'rate_per_1000')::bigint, 0), u);
  end loop;
  -- A discount is only checked against priced lines; lines without a rate yet don't block saving.
  if gross > 0 and gross - coalesce(_discount, 0) + coalesce(_delivery, 0) < 0 then raise exception 'Discount is larger than the invoice'; end if;
  if coalesce(_paid, 0) > 0 then
    if _handler is null then raise exception 'Choose who received the money'; end if;
    insert into public.transactions (entry_date, party_id, sale_id, kind, direction, amount, method, handler_user_id, category, created_by)
    values (_entry_date, _customer_id, sid, 'sale_receipt', 'in', _paid, coalesce(_method, 'cash'), _handler, 'sale', auth.uid());
  end if;
  return sid;
end;
$$;

-- ====== Rehra: what was carried and where from ======
alter table public.kiln_entries add column if not exists raw_type text not null default 'brick';
alter table public.kiln_entries add column if not exists from_store boolean not null default false;
do $c$ begin
  alter table public.kiln_entries add constraint kiln_entries_raw_type_valid check (raw_type in ('brick', '9t'));
exception when duplicate_object then null; end $c$;
do $c$ begin
  alter table public.kiln_entries add constraint kiln_entries_store_source check (not from_store or (stage = 'rehra' and source_party_id is null));
exception when duplicate_object then null; end $c$;

-- One-time: older rehra loads tagged with a 9T quality become 9t tile loads (closed seasons are left as they are).
do $rt$ begin
  if exists (select 1 from public.setup_steps where name = 'rehra_raw_type') then return; end if;
  update public.kiln_entries k set raw_type = '9t'
  from public.qualities q
  where q.id = k.quality_id and q.category = 'nine_t' and k.stage = 'rehra' and k.raw_type = 'brick'
    and not exists (select 1 from public.seasons s where s.id = k.season_id and s.is_closed);
  insert into public.setup_steps (name) values ('rehra_raw_type');
end $rt$;

-- ====== Kacha store ======
create table public.raw_store (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  season_id uuid references public.seasons(id),
  raw_type text not null default 'brick' check (raw_type in ('brick', '9t')),
  source text not null check (source in ('patheer', 'outsource', 'opening', 'adjust')),
  patheer_id uuid references public.parties(id),
  supplier text,
  count bigint not null check (count <> 0),
  notes text,
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (source = 'adjust' or count > 0),
  check (source = 'patheer' or patheer_id is null),
  check (source <> 'outsource' or length(btrim(coalesce(supplier, ''))) > 0)
);
create index raw_store_date_idx on public.raw_store (entry_date) where deleted_at is null;

create trigger touch_raw_store before update on public.raw_store for each row execute function public.touch_row();
create trigger guard_raw_store_season before insert or update on public.raw_store for each row execute function public.guard_season();
create trigger audit_raw_store after insert or update or delete on public.raw_store for each row execute function public.audit_row();

GRANT SELECT, INSERT, UPDATE ON public.raw_store TO authenticated;
GRANT ALL ON public.raw_store TO service_role;
ALTER TABLE public.raw_store ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read raw store" ON public.raw_store FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write raw store" ON public.raw_store FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update raw store" ON public.raw_store FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- Kacha store per type: everything stacked in − what rehra loaded from the store. Mirrors kachaStore() in kiln-math.ts.
create or replace view public.raw_store_stock
with (security_invoker = true) as
select x.raw_type,
       sum(x.from_patheer)::bigint as from_patheer,
       sum(x.outsourced)::bigint as outsourced,
       sum(x.opening)::bigint as opening,
       sum(x.adjusted)::bigint as adjusted,
       sum(x.used)::bigint as used,
       sum(x.from_patheer + x.outsourced + x.opening + x.adjusted - x.used)::bigint as balance
from (
  select v.raw_type, 0::bigint as from_patheer, 0::bigint as outsourced, 0::bigint as opening, 0::bigint as adjusted, 0::bigint as used
  from (values ('brick'), ('9t')) v(raw_type)
  union all
  select raw_type,
         case when source = 'patheer' then count else 0 end,
         case when source = 'outsource' then count else 0 end,
         case when source = 'opening' then count else 0 end,
         case when source = 'adjust' then count else 0 end,
         0
  from public.raw_store where deleted_at is null
  union all
  select raw_type, 0, 0, 0, 0, count from public.kiln_entries where stage = 'rehra' and from_store and deleted_at is null
) x
group by x.raw_type;

-- All kacha bricks at the yard (drying at patheers + kacha store). Bricks moved from a patheer into the store are a
-- move, not new bricks; outsource / opening / corrections are new.
create or replace view public.raw_stock
with (security_invoker = true) as
select m.made, l.loaded, a.adjusted,
       (m.made + e.external - l.loaded + a.adjusted)::bigint as balance,
       e.external, st.stored,
       (m.made + e.external - l.loaded + a.adjusted - st.stored)::bigint as drying
from (select coalesce(sum(confirmed_count), 0)::bigint as made from public.production_entries where deleted_at is null) m,
     (select coalesce(sum(count), 0)::bigint as loaded from public.kiln_entries where stage = 'rehra' and deleted_at is null) l,
     (select coalesce(sum(delta), 0)::bigint as adjusted from public.stock_adjustments where stock = 'raw' and deleted_at is null) a,
     (select coalesce(sum(count), 0)::bigint as external from public.raw_store where source <> 'patheer' and deleted_at is null) e,
     (select coalesce(sum(balance), 0)::bigint as stored from public.raw_store_stock) st;

GRANT SELECT ON public.raw_store_stock, public.raw_stock TO authenticated, service_role;

-- Customer accounts also say which customers are favourites (shown first when entering a sale).
create or replace view public.customer_accounts
with (security_invoker = true) as
select p.id as party_id, p.ref_no, p.name, p.phone, p.address, p.notes, p.is_cash, p.is_active,
       (-p.opening_balance)::bigint as opening_due,
       coalesce(st.bricks, 0)::bigint as bricks,
       coalesce(st.total, 0)::bigint as purchases,
       coalesce(st.n, 0)::bigint as sales_count,
       (coalesce(l.payments_in, 0) - coalesce(l.payments_out, 0))::bigint as payments,
       (coalesce(l.deductions, 0) - coalesce(l.credits, 0))::bigint as adjustments,
       (-coalesce(l.balance, -p.opening_balance))::bigint as outstanding,
       st.last_sale,
       p.is_favourite
from public.parties p
left join public.party_ledger l on l.party_id = p.id
left join (select customer_id, sum(bricks) bricks, sum(total) total, count(*) n, max(entry_date) last_sale from public.sale_totals group by customer_id) st on st.customer_id = p.id
where p.deleted_at is null and p.kind = 'customer';
GRANT SELECT ON public.customer_accounts TO authenticated, service_role;
