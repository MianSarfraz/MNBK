-- Phases 2–4: rehra / nakasi work, salaries, sales, stock, owners' cash.
-- Additive only. Money and bricks are bigint (whole rupees / whole bricks).
-- Balance sign convention: > 0 we owe the party, < 0 the party owes us.

-- ====== ENUMS ======
-- New enum value is not referenced anywhere else in this migration (safe inside one transaction).
alter type public.txn_kind add value if not exists 'owner_transfer';
create type public.kiln_stage as enum ('rehra', 'nakasi');
create type public.stock_kind as enum ('raw', 'finished');

-- ====== COLUMN ADDITIONS ======
alter table public.qualities add column if not exists stock_quality_id uuid references public.qualities(id);
comment on column public.qualities.stock_quality_id is 'For sale qualities: the nakasi (finished stock) quality this sale draws from. Null = not stock-tracked.';

alter table public.parties add column if not exists address text;
alter table public.parties add column if not exists monthly_salary bigint not null default 0 check (monthly_salary >= 0);
alter table public.parties add column if not exists updated_by uuid;

alter table public.transactions add column if not exists to_user_id uuid;
alter table public.transactions add column if not exists expense_category_id uuid references public.expense_categories(id);
alter table public.transactions add column if not exists updated_by uuid;
alter table public.transactions add constraint transactions_transfer_not_self check (to_user_id is null or to_user_id <> handler_user_id);

-- Seed stock mapping for sale qualities whose name matches a nakasi quality exactly.
update public.qualities s set stock_quality_id = n.id
from public.qualities n
where s.kind = 'sale' and n.kind = 'nakasi' and lower(s.name_en) = lower(n.name_en) and s.stock_quality_id is null;

-- ====== KILN ENTRIES (rehra loads raw bricks in, nakasi takes baked bricks out) ======
create table public.kiln_entries (
  id uuid primary key default gen_random_uuid(),
  stage public.kiln_stage not null,
  party_id uuid not null references public.parties(id),
  season_id uuid not null references public.seasons(id),
  week_id uuid not null references public.weeks(id),
  entry_date date not null,
  quality_id uuid references public.qualities(id),
  source_party_id uuid references public.parties(id),
  count bigint not null check (count > 0),
  notes text,
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (stage = 'rehra' or source_party_id is null),
  check (stage = 'rehra' or quality_id is not null)
);
create index kiln_entries_week_idx on public.kiln_entries (stage, week_id) where deleted_at is null;
create index kiln_entries_party_idx on public.kiln_entries (party_id, entry_date) where deleted_at is null;

-- ====== SALARY ACCRUALS (one row per employee per month) ======
create table public.salary_months (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id),
  season_id uuid references public.seasons(id),
  entry_date date not null check (extract(day from entry_date) = 1),
  amount bigint not null check (amount > 0),
  note text,
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index salary_months_one_per_month on public.salary_months (party_id, entry_date) where deleted_at is null;

-- ====== SALES ======
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no bigint generated always as identity unique,
  entry_date date not null,
  season_id uuid references public.seasons(id),
  customer_id uuid not null references public.parties(id),
  vehicle_no text,
  driver_name text,
  discount bigint not null default 0 check (discount >= 0),
  delivery_charges bigint not null default 0 check (delivery_charges >= 0),
  note text,
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index sales_customer_idx on public.sales (customer_id, entry_date) where deleted_at is null;
create index sales_date_idx on public.sales (entry_date) where deleted_at is null;

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id),
  quality_id uuid not null references public.qualities(id),
  quantity bigint not null check (quantity > 0),
  rate_per_1000 bigint not null check (rate_per_1000 > 0),
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index sale_items_sale_idx on public.sale_items (sale_id) where deleted_at is null;

alter table public.transactions add column if not exists sale_id uuid references public.sales(id);
create index if not exists txn_sale_idx on public.transactions (sale_id) where deleted_at is null;

-- ====== STOCK ADJUSTMENTS (breakage, shortage…) ======
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  stock public.stock_kind not null,
  quality_id uuid references public.qualities(id),
  entry_date date not null,
  season_id uuid references public.seasons(id),
  delta bigint not null check (delta <> 0),
  reason text not null check (length(btrim(reason)) > 0),
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (stock = 'raw' or quality_id is not null)
);

-- ====== CASH COUNTS (physical cash counted by an owner; expected cash is always derived) ======
create table public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  entry_date date not null,
  counted bigint not null check (counted >= 0),
  note text,
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ====== TRIGGERS: touch, season lock, validation ======
create or replace function public.touch_row()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists touch_parties on public.parties;
drop trigger if exists touch_transactions on public.transactions;
drop trigger if exists touch_production on public.production_entries;
create trigger touch_parties before update on public.parties for each row execute function public.touch_row();
create trigger touch_transactions before update on public.transactions for each row execute function public.touch_row();
create trigger touch_production before update on public.production_entries for each row execute function public.touch_row();
create trigger touch_kiln before update on public.kiln_entries for each row execute function public.touch_row();
create trigger touch_salary_months before update on public.salary_months for each row execute function public.touch_row();
create trigger touch_sales before update on public.sales for each row execute function public.touch_row();
create trigger touch_sale_items before update on public.sale_items for each row execute function public.touch_row();
create trigger touch_stock_adj before update on public.stock_adjustments for each row execute function public.touch_row();
create trigger touch_cash_counts before update on public.cash_counts for each row execute function public.touch_row();

create or replace function public.season_for_date(_d date)
returns uuid language sql stable set search_path = public as $$
  select id from public.seasons
  where deleted_at is null and _d between start_date and end_date
  order by start_date desc limit 1;
$$;

-- Fills season_id from entry_date when missing; blocks writes into, or edits of rows in, a closed season.
create or replace function public.guard_season()
returns trigger language plpgsql set search_path = public as $$
declare
  closed boolean;
begin
  if tg_op = 'UPDATE' and old.season_id is not null then
    select is_closed into closed from public.seasons where id = old.season_id;
    if closed then raise exception 'Season is closed (read-only)'; end if;
  end if;
  if new.season_id is null then
    new.season_id := public.season_for_date(new.entry_date);
  end if;
  if new.season_id is not null then
    select is_closed into closed from public.seasons where id = new.season_id;
    if closed then raise exception 'Season is closed (read-only)'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_txn_season on public.transactions;
create trigger guard_txn_season before insert or update on public.transactions for each row execute function public.guard_season();
create trigger guard_salary_season before insert or update on public.salary_months for each row execute function public.guard_season();
create trigger guard_sales_season before insert or update on public.sales for each row execute function public.guard_season();
create trigger guard_stock_adj_season before insert or update on public.stock_adjustments for each row execute function public.guard_season();

create or replace function public.validate_kiln_entry()
returns trigger language plpgsql set search_path = public as $$
declare
  wk record;
  pk public.party_kind;
  qk public.quality_kind;
begin
  if tg_op = 'UPDATE' and exists (select 1 from public.seasons where id = old.season_id and is_closed) then
    raise exception 'Season is closed (read-only)';
  end if;
  select w.season_id, w.start_date, w.end_date, s.is_closed into wk
    from public.weeks w join public.seasons s on s.id = w.season_id where w.id = new.week_id;
  if wk is null then raise exception 'Week not found'; end if;
  if wk.is_closed then raise exception 'Season is closed (read-only)'; end if;
  if new.season_id <> wk.season_id then raise exception 'Season does not match the week'; end if;
  if new.entry_date < wk.start_date or new.entry_date > wk.end_date then
    raise exception 'Entry date is outside the selected week';
  end if;
  select kind into pk from public.parties where id = new.party_id;
  if pk::text <> new.stage::text then raise exception 'Worker type does not match (% vs %)', pk, new.stage; end if;
  if new.source_party_id is not null then
    select kind into pk from public.parties where id = new.source_party_id;
    if pk <> 'patheer' then raise exception 'Source must be a patheer'; end if;
  end if;
  if new.stage = 'nakasi' then
    select kind into qk from public.qualities where id = new.quality_id;
    if qk <> 'nakasi' then raise exception 'Nakasi output needs a nakasi quality'; end if;
  end if;
  return new;
end;
$$;
create trigger validate_kiln before insert or update on public.kiln_entries for each row execute function public.validate_kiln_entry();

create or replace function public.validate_sale()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select kind from public.parties where id = new.customer_id) <> 'customer' then
    raise exception 'Sale must be to a customer';
  end if;
  return new;
end;
$$;
create trigger validate_sale before insert or update on public.sales for each row execute function public.validate_sale();

create or replace function public.guard_sale_item()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.sales s join public.seasons se on se.id = s.season_id
    where s.id in (new.sale_id, case when tg_op = 'UPDATE' then old.sale_id end) and se.is_closed
  ) then
    raise exception 'Season is closed (read-only)';
  end if;
  return new;
end;
$$;
create trigger guard_sale_item before insert or update on public.sale_items for each row execute function public.guard_sale_item();

create or replace function public.validate_salary_month()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select kind from public.parties where id = new.party_id) <> 'employee' then
    raise exception 'Salary can only be posted to an employee';
  end if;
  return new;
end;
$$;
create trigger validate_salary_month before insert or update on public.salary_months for each row execute function public.validate_salary_month();

-- ====== AUDIT (every insert/update/delete logged with old/new values) ======
create trigger audit_kiln after insert or update or delete on public.kiln_entries for each row execute function public.audit_row();
create trigger audit_salary_months after insert or update or delete on public.salary_months for each row execute function public.audit_row();
create trigger audit_sales after insert or update or delete on public.sales for each row execute function public.audit_row();
create trigger audit_sale_items after insert or update or delete on public.sale_items for each row execute function public.audit_row();
create trigger audit_stock_adj after insert or update or delete on public.stock_adjustments for each row execute function public.audit_row();
create trigger audit_cash_counts after insert or update or delete on public.cash_counts for each row execute function public.audit_row();

-- ====== ATOMIC SALE: invoice + lines + amount received now, in one transaction ======
create or replace function public.create_sale(
  _entry_date date,
  _customer_id uuid,
  _vehicle_no text,
  _driver_name text,
  _discount bigint,
  _delivery bigint,
  _note text,
  _items jsonb,
  _paid bigint,
  _method public.pay_method,
  _handler uuid
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  sid uuid;
  it jsonb;
  gross bigint := 0;
begin
  if _items is null or jsonb_array_length(_items) = 0 then
    raise exception 'Invoice needs at least one line';
  end if;
  insert into public.sales (entry_date, customer_id, vehicle_no, driver_name, discount, delivery_charges, note, created_by)
  values (_entry_date, _customer_id, nullif(btrim(_vehicle_no), ''), nullif(btrim(_driver_name), ''),
          coalesce(_discount, 0), coalesce(_delivery, 0), nullif(btrim(_note), ''), auth.uid())
  returning id into sid;
  for it in select * from jsonb_array_elements(_items) loop
    insert into public.sale_items (sale_id, quality_id, quantity, rate_per_1000, created_by)
    values (sid, (it ->> 'quality_id')::uuid, (it ->> 'quantity')::bigint, (it ->> 'rate_per_1000')::bigint, auth.uid());
    gross := gross + ((it ->> 'quantity')::bigint * (it ->> 'rate_per_1000')::bigint + 500) / 1000;
  end loop;
  if gross - coalesce(_discount, 0) + coalesce(_delivery, 0) < 0 then
    raise exception 'Discount is larger than the invoice';
  end if;
  if coalesce(_paid, 0) > 0 then
    if _handler is null then raise exception 'Choose who received the money'; end if;
    insert into public.transactions (entry_date, party_id, sale_id, kind, direction, amount, method, handler_user_id, category, created_by)
    values (_entry_date, _customer_id, sid, 'sale_receipt', 'in', _paid, coalesce(_method, 'cash'), _handler, 'sale', auth.uid());
  end if;
  return sid;
end;
$$;
revoke execute on function public.create_sale(date, uuid, text, text, bigint, bigint, text, jsonb, bigint, public.pay_method, uuid) from public;
grant execute on function public.create_sale(date, uuid, text, text, bigint, bigint, text, jsonb, bigint, public.pay_method, uuid) to authenticated;

-- ====== VIEWS (balances and stock are always derived) ======
drop view if exists public.party_ledger;
drop view if exists public.party_earnings;

-- Earnings credited to a party: patheer confirmed bricks, rehra/nakasi counts (rate on the entry date,
-- half-up per entry), and posted monthly salaries.
create view public.party_earnings
with (security_invoker = true) as
select x.party_id, sum(x.amount)::bigint as earnings
from (
  select pe.party_id, (pe.confirmed_count * r.rate_per_1000 + 500) / 1000 as amount
  from public.production_entries pe
  join lateral (
    select pr.rate_per_1000 from public.party_rates pr
    where pr.party_id = pe.party_id and pr.kind = 'earning' and pr.effective_from <= pe.entry_date and pr.deleted_at is null
    order by pr.effective_from desc limit 1
  ) r on true
  where pe.deleted_at is null and pe.confirmed_count is not null
  union all
  select ke.party_id, (ke.count * r.rate_per_1000 + 500) / 1000
  from public.kiln_entries ke
  join lateral (
    select pr.rate_per_1000 from public.party_rates pr
    where pr.party_id = ke.party_id and pr.kind = 'earning' and pr.effective_from <= ke.entry_date and pr.deleted_at is null
    order by pr.effective_from desc limit 1
  ) r on true
  where ke.deleted_at is null
  union all
  select sm.party_id, sm.amount from public.salary_months sm where sm.deleted_at is null
) x
group by x.party_id;

create view public.sale_totals
with (security_invoker = true) as
select s.id as sale_id, s.invoice_no, s.customer_id, s.entry_date, s.season_id,
       coalesce(sum((si.quantity * si.rate_per_1000 + 500) / 1000), 0)::bigint as gross,
       coalesce(sum(si.quantity), 0)::bigint as bricks,
       s.discount, s.delivery_charges,
       (coalesce(sum((si.quantity * si.rate_per_1000 + 500) / 1000), 0) - s.discount + s.delivery_charges)::bigint as total
from public.sales s
left join public.sale_items si on si.sale_id = s.id and si.deleted_at is null
where s.deleted_at is null
group by s.id;

-- Mirrors txnEffect() in src/lib/kiln-math.ts.
create view public.party_ledger
with (security_invoker = true) as
select p.id as party_id,
       p.kind as party_kind,
       p.opening_balance,
       coalesce(e.earnings, 0)::bigint as earnings,
       coalesce(st.sales, 0)::bigint as sales,
       coalesce(t.kharcha, 0)::bigint as kharcha,
       coalesce(t.payments_out, 0)::bigint as payments_out,
       coalesce(t.payments_in, 0)::bigint as payments_in,
       coalesce(t.deductions, 0)::bigint as deductions,
       coalesce(t.credits, 0)::bigint as credits,
       (p.opening_balance
         + coalesce(e.earnings, 0)
         - coalesce(st.sales, 0)
         - coalesce(t.payments_out, 0)
         + coalesce(t.payments_in, 0)
         - coalesce(t.deductions, 0)
         + coalesce(t.credits, 0))::bigint as balance
from public.parties p
left join public.party_earnings e on e.party_id = p.id
left join (select customer_id, sum(total) as sales from public.sale_totals group by customer_id) st on st.customer_id = p.id
left join (
  select party_id,
         sum(case when kind = 'kharcha' and direction = 'out' then amount else 0 end) as kharcha,
         sum(case when kind in ('kharcha', 'salary', 'worker_payment_us', 'worker_payment_them', 'sale_receipt') and direction = 'out' then amount else 0 end) as payments_out,
         sum(case when kind in ('kharcha', 'salary', 'worker_payment_us', 'worker_payment_them', 'sale_receipt') and direction = 'in' then amount else 0 end) as payments_in,
         sum(case when kind = 'adjustment' and direction = 'in' then amount else 0 end) as deductions,
         sum(case when kind = 'adjustment' and direction = 'out' then amount else 0 end) as credits
  from public.transactions
  where deleted_at is null and party_id is not null
  group by party_id
) t on t.party_id = p.id
where p.deleted_at is null;

create view public.finished_stock
with (security_invoker = true) as
select q.id as quality_id, q.name_en, q.name_ur, q.category,
       coalesce(pr.n, 0)::bigint as produced,
       coalesce(so.n, 0)::bigint as sold,
       coalesce(ad.n, 0)::bigint as adjusted,
       (coalesce(pr.n, 0) - coalesce(so.n, 0) + coalesce(ad.n, 0))::bigint as balance
from public.qualities q
left join (
  select quality_id, sum(count) as n from public.kiln_entries
  where stage = 'nakasi' and deleted_at is null group by quality_id
) pr on pr.quality_id = q.id
left join (
  select sq.stock_quality_id as qid, sum(si.quantity) as n
  from public.sale_items si
  join public.sales s on s.id = si.sale_id and s.deleted_at is null
  join public.qualities sq on sq.id = si.quality_id
  where si.deleted_at is null and sq.stock_quality_id is not null
  group by sq.stock_quality_id
) so on so.qid = q.id
left join (
  select quality_id, sum(delta) as n from public.stock_adjustments
  where stock = 'finished' and deleted_at is null group by quality_id
) ad on ad.quality_id = q.id
where q.deleted_at is null and q.kind = 'nakasi';

create view public.raw_stock
with (security_invoker = true) as
select m.made, l.loaded, a.adjusted, (m.made - l.loaded + a.adjusted)::bigint as balance
from (select coalesce(sum(confirmed_count), 0)::bigint as made from public.production_entries where deleted_at is null) m,
     (select coalesce(sum(count), 0)::bigint as loaded from public.kiln_entries where stage = 'rehra' and deleted_at is null) l,
     (select coalesce(sum(delta), 0)::bigint as adjusted from public.stock_adjustments where stock = 'raw' and deleted_at is null) a;

-- ====== GRANTS (no hard deletes: DELETE is not granted on business tables) ======
GRANT SELECT, INSERT, UPDATE ON public.kiln_entries, public.salary_months, public.sales, public.sale_items, public.stock_adjustments, public.cash_counts TO authenticated;
GRANT ALL ON public.kiln_entries, public.salary_months, public.sales, public.sale_items, public.stock_adjustments, public.cash_counts TO service_role;
GRANT SELECT ON public.party_earnings, public.party_ledger, public.sale_totals, public.finished_stock, public.raw_stock TO authenticated;
GRANT SELECT ON public.party_earnings, public.party_ledger, public.sale_totals, public.finished_stock, public.raw_stock TO service_role;
REVOKE DELETE ON public.seasons, public.weeks, public.qualities, public.parties, public.party_rates,
  public.production_entries, public.transactions, public.expense_categories FROM authenticated;

-- ====== RLS (owners only) ======
ALTER TABLE public.kiln_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read kiln" ON public.kiln_entries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write kiln" ON public.kiln_entries FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update kiln" ON public.kiln_entries FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read salary" ON public.salary_months FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write salary" ON public.salary_months FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update salary" ON public.salary_months FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read sales" ON public.sales FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update sales" ON public.sales FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read sale items" ON public.sale_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write sale items" ON public.sale_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update sale items" ON public.sale_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read stock adj" ON public.stock_adjustments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write stock adj" ON public.stock_adjustments FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update stock adj" ON public.stock_adjustments FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read cash counts" ON public.cash_counts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write cash counts" ON public.cash_counts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update cash counts" ON public.cash_counts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

-- ====== RECEIPT PHOTOS (private bucket, owners only) ======
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
CREATE POLICY "owners read receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners upload receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND public.has_role(auth.uid(), 'owner'));
