-- ====== SEED: qualities (master list from the owner) ======
insert into public.qualities (name_en, name_ur, kind, category, sort_order, created_by) values
  ('Awal', 'اول', 'sale', 'normal', 1, '00000000-0000-0000-0000-000000000000'),
  ('Awal Brshi', 'اول برشی', 'sale', 'normal', 2, '00000000-0000-0000-0000-000000000000'),
  ('Special', 'اسپیشل', 'sale', 'special', 3, '00000000-0000-0000-0000-000000000000'),
  ('Doum', 'دوم', 'sale', 'normal', 4, '00000000-0000-0000-0000-000000000000'),
  ('Tirak', 'ترک', 'sale', 'normal', 5, '00000000-0000-0000-0000-000000000000'),
  ('9T Awal', '9T اول', 'sale', 'nine_t', 6, '00000000-0000-0000-0000-000000000000'),
  ('9T Doum', '9T دوم', 'sale', 'nine_t', 7, '00000000-0000-0000-0000-000000000000'),
  ('9T Tirak', '9T ترک', 'sale', 'nine_t', 8, '00000000-0000-0000-0000-000000000000'),
  ('Trali Roray', 'ترالی روڑے', 'sale', 'other', 9, '00000000-0000-0000-0000-000000000000'),
  ('Rehra Roray', 'رہڑا روڑے', 'sale', 'other', 10, '00000000-0000-0000-0000-000000000000'),
  ('Rehra 9T Roray', 'رہڑا 9T روڑے', 'sale', 'other', 11, '00000000-0000-0000-0000-000000000000'),
  ('Awal', 'اول', 'nakasi', 'normal', 20, '00000000-0000-0000-0000-000000000000'),
  ('Doum', 'دوم', 'nakasi', 'normal', 21, '00000000-0000-0000-0000-000000000000'),
  ('Tirak', 'ترک', 'nakasi', 'normal', 22, '00000000-0000-0000-0000-000000000000'),
  ('9T', '9T', 'nakasi', 'nine_t', 23, '00000000-0000-0000-0000-000000000000'),
  ('9T Dara', '9T ڈارا', 'nakasi', 'nine_t', 24, '00000000-0000-0000-0000-000000000000'),
  ('Kali', 'کالی', 'nakasi', 'other', 25, '00000000-0000-0000-0000-000000000000');

insert into public.expense_categories (name_en, name_ur, sort_order, created_by) values
  ('Coal / Fuel', 'کوئلہ / ایندھن', 1, '00000000-0000-0000-0000-000000000000'),
  ('Diesel', 'ڈیزل', 2, '00000000-0000-0000-0000-000000000000'),
  ('Repairs', 'مرمت', 3, '00000000-0000-0000-0000-000000000000'),
  ('Electricity', 'بجلی', 4, '00000000-0000-0000-0000-000000000000'),
  ('Transport', 'ٹرانسپورٹ', 5, '00000000-0000-0000-0000-000000000000'),
  ('Salary', 'تنخواہ', 6, '00000000-0000-0000-0000-000000000000'),
  ('Misc', 'متفرق', 7, '00000000-0000-0000-0000-000000000000');

-- ====== updated_at touch trigger ======
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_seasons before update on public.seasons for each row execute function public.touch_updated_at();
create trigger touch_qualities before update on public.qualities for each row execute function public.touch_updated_at();
create trigger touch_parties before update on public.parties for each row execute function public.touch_updated_at();
create trigger touch_production before update on public.production_entries for each row execute function public.touch_updated_at();
create trigger touch_transactions before update on public.transactions for each row execute function public.touch_updated_at();
create trigger touch_categories before update on public.expense_categories for each row execute function public.touch_updated_at();
create trigger touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();

-- ====== AUDIT trigger (every insert/update/delete logged) ======
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (table_name, row_id, action, old_values, new_values, changed_by)
  values (
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_seasons after insert or update or delete on public.seasons for each row execute function public.audit_row();
create trigger audit_weeks after insert or update or delete on public.weeks for each row execute function public.audit_row();
create trigger audit_qualities after insert or update or delete on public.qualities for each row execute function public.audit_row();
create trigger audit_parties after insert or update or delete on public.parties for each row execute function public.audit_row();
create trigger audit_party_rates after insert or update or delete on public.party_rates for each row execute function public.audit_row();
create trigger audit_production after insert or update or delete on public.production_entries for each row execute function public.audit_row();
create trigger audit_transactions after insert or update or delete on public.transactions for each row execute function public.audit_row();
create trigger audit_categories after insert or update or delete on public.expense_categories for each row execute function public.audit_row();

-- ====== VALIDATION triggers ======
create or replace function public.validate_production_entry()
returns trigger language plpgsql as $$
declare
  wk record;
begin
  select w.season_id, w.start_date, w.end_date, s.is_closed
    into wk
    from public.weeks w join public.seasons s on s.id = w.season_id
    where w.id = new.week_id;
  if wk is null then
    raise exception 'Week not found';
  end if;
  if wk.is_closed then
    raise exception 'Season is closed (read-only)';
  end if;
  if new.entry_date < wk.start_date or new.entry_date > wk.end_date then
    raise exception 'Entry date is outside the selected week';
  end if;
  if new.season_id <> wk.season_id then
    raise exception 'Season does not match the week';
  end if;
  if new.confirmed_count is not null and new.confirmed_at is null then
    new.confirmed_at = now();
  end if;
  if new.confirmed_count is null then
    new.confirmed_at = null;
  end if;
  return new;
end;
$$;

create trigger validate_production before insert or update on public.production_entries for each row execute function public.validate_production_entry();

create or replace function public.validate_transaction_season()
returns trigger language plpgsql as $$
declare
  closed boolean;
begin
  if new.season_id is not null then
    select is_closed into closed from public.seasons where id = new.season_id;
    if closed then
      raise exception 'Season is closed (read-only)';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_txn_season before insert or update on public.transactions for each row execute function public.validate_transaction_season();

-- ====== LEDGER VIEWS (balances always computed, never stored) ======
create or replace view public.party_earnings
with (security_invoker = true) as
select pe.party_id,
       sum((pe.confirmed_count * r.rate_per_1000 + 500) / 1000)::bigint as earnings
from public.production_entries pe
join lateral (
  select pr.rate_per_1000
  from public.party_rates pr
  where pr.party_id = pe.party_id
    and pr.kind = 'earning'
    and pr.effective_from <= pe.entry_date
    and pr.deleted_at is null
  order by pr.effective_from desc
  limit 1
) r on true
where pe.deleted_at is null
  and pe.confirmed_count is not null
  and r.rate_per_1000 is not null
group by pe.party_id;

create or replace view public.party_ledger
with (security_invoker = true) as
select p.id as party_id,
       p.kind as party_kind,
       p.opening_balance,
       coalesce(e.earnings, 0) as earnings,
       coalesce(k.kharcha, 0) as kharcha,
       coalesce(t.paid_by_us, 0) as paid_by_us,
       coalesce(t.paid_by_them, 0) as paid_by_them,
       coalesce(t.deductions, 0) as deductions,
       p.opening_balance
         + coalesce(e.earnings, 0)
         - coalesce(k.kharcha, 0)
         - coalesce(t.paid_by_us, 0)
         + coalesce(t.paid_by_them, 0)
         - coalesce(t.deductions, 0) as balance
from public.parties p
left join public.party_earnings e on e.party_id = p.id
left join (
  select party_id, sum(amount) as kharcha
  from public.transactions
  where kind = 'kharcha' and direction = 'out' and deleted_at is null
  group by party_id
) k on k.party_id = p.id
left join (
  select party_id,
         sum(case when direction = 'out' and kind in ('worker_payment_us') then amount else 0 end) as paid_by_us,
         sum(case when direction = 'in' and kind = 'worker_payment_them' then amount else 0 end) as paid_by_them,
         sum(case when direction = 'in' and kind = 'adjustment' then amount else 0 end) as deductions
  from public.transactions
  where deleted_at is null
  group by party_id
) t on t.party_id = p.id
where p.deleted_at is null;

GRANT SELECT ON public.party_earnings TO authenticated;
GRANT SELECT ON public.party_ledger TO authenticated;
