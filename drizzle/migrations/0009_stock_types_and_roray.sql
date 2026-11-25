-- Nine stock brick types (used everywhere: opening stock, production, stock, sales) and a separate list of
-- sale-only items sold by the load: roray (broken bricks) by trolley or rehra. Roray are never stock-tracked and are
-- priced per load, not per 1000 bricks.

-- ====== Unit: 'thousand' = rate per 1000 bricks (brick types); 'load' = rate per trolley/rehra (roray) ======
alter table public.qualities add column if not exists unit text not null default 'thousand';
do $c$ begin
  alter table public.qualities add constraint qualities_unit_valid check (unit in ('thousand', 'load'));
exception when duplicate_object then null; end $c$;
do $c$ begin
  alter table public.qualities add constraint qualities_load_is_sale_only check (unit = 'thousand' or (kind = 'sale' and stock_quality_id is null));
exception when duplicate_object then null; end $c$;

-- Line amount, half-up per line. Mirrors lineAmount() in src/lib/kiln-math.ts.
create or replace function public.line_amount(_qty bigint, _rate bigint, _unit text)
returns bigint language sql immutable as $$
  select case when _unit = 'load' then _qty * _rate else (_qty * _rate + 500) / 1000 end
$$;

-- ====== One-time: the nine brick types + roray (later edits by owners are never undone by a re-run) ======
do $st$
declare
  zero uuid := '00000000-0000-0000-0000-000000000000';
  types text[] := array['Awal', 'Awal Barshi', 'Special', 'Awal Machine', 'Doum', 'Tirak', '9t Awal', '9t Doum', '9t Tirak'];
  cats text[] := array['normal', 'normal', 'special', 'normal', 'normal', 'normal', 'nine_t', 'nine_t', 'nine_t'];
  roray text[] := array['Trali Roray', 'Rehra Roray', 'Rehra 9T Roray'];
  i int;
  qid uuid;
begin
  if exists (select 1 from public.setup_steps where name = 'nine_types_and_roray') then return; end if;

  -- Renames: "9t" → "9t Awal", "Awal Brshi" → "Awal Barshi" (only when the new name isn't taken).
  if not exists (select 1 from public.qualities where kind = 'nakasi' and deleted_at is null and lower(btrim(name_en)) = '9t awal') then
    update public.qualities set name_en = '9t Awal', name_ur = '9t Awal'
    where kind = 'nakasi' and deleted_at is null and lower(btrim(name_en)) = '9t';
  end if;
  if not exists (select 1 from public.qualities where kind = 'nakasi' and deleted_at is null and lower(btrim(name_en)) = 'awal barshi') then
    update public.qualities set name_en = 'Awal Barshi', name_ur = 'Awal Barshi'
    where kind = 'nakasi' and deleted_at is null and lower(btrim(name_en)) = 'awal brshi';
  end if;

  -- Other brick types go after the nine (owner-added ones keep their on/off state).
  update public.qualities set sort_order = sort_order + 100
  where kind = 'nakasi' and deleted_at is null and lower(btrim(name_en)) <> all (select lower(x) from unnest(types) x);

  for i in 1 .. array_length(types, 1) loop
    if not exists (select 1 from public.qualities where kind = 'nakasi' and deleted_at is null and lower(btrim(name_en)) = lower(types[i])) then
      insert into public.qualities (name_en, name_ur, kind, category, sort_order, created_by)
      values (types[i], types[i], 'nakasi', cats[i]::public.quality_category, i, zero);
    end if;
    update public.qualities set sort_order = i, category = cats[i]::public.quality_category, is_active = true, unit = 'thousand'
    where kind = 'nakasi' and deleted_at is null and lower(btrim(name_en)) = lower(types[i]);
  end loop;

  -- Older sale names count against the matching brick type's stock (e.g. "9T Awal" → "9t Awal", "Awal Brshi" → "Awal Barshi").
  update public.qualities s set stock_quality_id = n.id
  from public.qualities n
  where s.kind = 'sale' and s.deleted_at is null and s.stock_quality_id is null
    and lower(btrim(s.name_en)) not like '%roray%'
    and n.kind = 'nakasi' and n.deleted_at is null
    and replace(lower(btrim(n.name_en)), 'barshi', 'brshi') = replace(lower(btrim(s.name_en)), 'barshi', 'brshi');

  -- Roray: sale-only, per load.
  for i in 1 .. array_length(roray, 1) loop
    -- A roray an owner added as a brick type: move it to the sale-only list if nothing was recorded on it yet,
    -- otherwise switch it off and use a fresh sale-only item.
    for qid in select id from public.qualities where kind = 'nakasi' and deleted_at is null and lower(btrim(name_en)) = lower(roray[i]) loop
      if exists (select 1 from public.sale_items where quality_id = qid)
         or exists (select 1 from public.kiln_entries where quality_id = qid)
         or exists (select 1 from public.stock_adjustments where quality_id = qid) then
        update public.qualities set is_active = false, name_en = name_en || ' (old)', name_ur = name_ur || ' (old)' where id = qid;
      elsif not exists (select 1 from public.qualities where kind = 'sale' and deleted_at is null and lower(btrim(name_en)) = lower(roray[i])) then
        update public.qualities set kind = 'sale', category = 'other', stock_quality_id = null where id = qid;
      else
        update public.qualities set deleted_at = now(), is_active = false where id = qid;
      end if;
    end loop;
    if not exists (select 1 from public.qualities where kind = 'sale' and deleted_at is null and lower(btrim(name_en)) = lower(roray[i])) then
      insert into public.qualities (name_en, name_ur, kind, category, sort_order, unit, created_by)
      values (roray[i], roray[i], 'sale', 'other', 200 + i, 'load', zero);
    end if;
    update public.qualities set unit = 'load', is_active = true, stock_quality_id = null, category = 'other', sort_order = 200 + i
    where kind = 'sale' and deleted_at is null and lower(btrim(name_en)) = lower(roray[i]);
  end loop;

  insert into public.setup_steps (name) values ('nine_types_and_roray');
end $st$;

-- ====== Sales use the unit (per 1000 bricks, or per load) ======
create or replace function public.sync_cash_sale(_sale uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record;
  total bigint;
  rid uuid;
begin
  select sa.*, p.is_cash into s from public.sales sa join public.parties p on p.id = sa.customer_id where sa.id = _sale;
  if s is null or not s.is_cash then return; end if;
  select coalesce(sum(public.line_amount(si.quantity, si.rate_per_1000, q.unit)), 0) - s.discount + s.delivery_charges into total
    from public.sale_items si join public.qualities q on q.id = si.quality_id
    where si.sale_id = _sale and si.deleted_at is null;
  select id into rid from public.transactions where sale_id = _sale and category = 'cash_sale' and deleted_at is null limit 1;
  if s.deleted_at is not null or total <= 0 then
    if rid is not null then update public.transactions set deleted_at = now() where id = rid; end if;
  elsif rid is null then
    insert into public.transactions (entry_date, party_id, sale_id, kind, direction, amount, method, handler_user_id, category, note, created_by)
    values (s.entry_date, s.customer_id, _sale, 'sale_receipt', 'in', total, 'cash', coalesce(auth.uid(), s.created_by), 'cash_sale', 'Nakad Bikri — paid at sale', coalesce(auth.uid(), s.created_by));
  else
    update public.transactions set amount = total, entry_date = s.entry_date where id = rid and (amount <> total or entry_date <> s.entry_date);
  end if;
end;
$$;

create or replace function public.create_sale(
  _entry_date date, _customer_id uuid, _vehicle_no text, _driver_name text, _discount bigint, _delivery bigint,
  _note text, _items jsonb, _paid bigint, _method public.pay_method, _handler uuid
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  sid uuid;
  it jsonb;
  gross bigint := 0;
  cash boolean;
  u text;
begin
  if _items is null or jsonb_array_length(_items) = 0 then raise exception 'Invoice needs at least one line'; end if;
  select is_cash into cash from public.parties where id = _customer_id;
  insert into public.sales (entry_date, customer_id, vehicle_no, driver_name, discount, delivery_charges, note, created_by)
  values (_entry_date, _customer_id, nullif(btrim(_vehicle_no), ''), nullif(btrim(_driver_name), ''),
          coalesce(_discount, 0), coalesce(_delivery, 0), nullif(btrim(_note), ''), auth.uid())
  returning id into sid;
  for it in select * from jsonb_array_elements(_items) loop
    insert into public.sale_items (sale_id, quality_id, quantity, rate_per_1000, created_by)
    values (sid, (it ->> 'quality_id')::uuid, (it ->> 'quantity')::bigint, (it ->> 'rate_per_1000')::bigint, auth.uid());
    select unit into u from public.qualities where id = (it ->> 'quality_id')::uuid;
    gross := gross + public.line_amount((it ->> 'quantity')::bigint, (it ->> 'rate_per_1000')::bigint, u);
  end loop;
  if gross - coalesce(_discount, 0) + coalesce(_delivery, 0) < 0 then raise exception 'Discount is larger than the invoice'; end if;
  if not coalesce(cash, false) and coalesce(_paid, 0) > 0 then
    if _handler is null then raise exception 'Choose who received the money'; end if;
    insert into public.transactions (entry_date, party_id, sale_id, kind, direction, amount, method, handler_user_id, category, created_by)
    values (_entry_date, _customer_id, sid, 'sale_receipt', 'in', _paid, coalesce(_method, 'cash'), _handler, 'sale', auth.uid());
  end if;
  return sid;
end;
$$;

-- ====== Views: amounts by unit; "bricks" counts brick types only, "loads" counts roray loads ======
create or replace view public.sale_totals
with (security_invoker = true) as
select s.id as sale_id, s.invoice_no, s.customer_id, s.entry_date, s.season_id,
       coalesce(sum(public.line_amount(si.quantity, si.rate_per_1000, q.unit)), 0)::bigint as gross,
       coalesce(sum(si.quantity) filter (where q.unit = 'thousand'), 0)::bigint as bricks,
       s.discount, s.delivery_charges,
       (coalesce(sum(public.line_amount(si.quantity, si.rate_per_1000, q.unit)), 0) - s.discount + s.delivery_charges)::bigint as total,
       coalesce(sum(si.quantity) filter (where q.unit = 'load'), 0)::bigint as loads
from public.sales s
left join public.sale_items si on si.sale_id = s.id and si.deleted_at is null
left join public.qualities q on q.id = si.quality_id
where s.deleted_at is null
group by s.id;

create or replace view public.sale_lines
with (security_invoker = true) as
select si.id as item_id, s.id as sale_id, s.invoice_no, s.entry_date, s.customer_id, s.vehicle_no, s.driver_name, s.note,
       si.quality_id, si.quantity, si.rate_per_1000, public.line_amount(si.quantity, si.rate_per_1000, q.unit) as amount, s.season_id,
       q.unit
from public.sale_items si
join public.sales s on s.id = si.sale_id and s.deleted_at is null
join public.qualities q on q.id = si.quality_id
where si.deleted_at is null;

GRANT SELECT ON public.sale_totals, public.sale_lines TO authenticated, service_role;
