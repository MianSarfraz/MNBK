-- Delete (soft) for the things that had no delete before: people/customers/agents, seasons, brick types and roray,
-- gairs and expense categories. Rows get deleted_at (never removed), so audit_row keeps the full history.
-- Each runs as the caller (RLS applies), checks for an owner, and is one transaction: all or nothing.

-- A person and everything on their khatta: entries, payments, sales, purchases, rates, salary.
-- Nakad Bikri stays (protect_cash_customer). Rows in a closed season make it fail (guard_season).
create or replace function public.delete_party(_id uuid)
returns void language plpgsql set search_path = public as $$
declare
  p record;
  ts timestamptz := now();
begin
  if not public.has_role(auth.uid(), 'owner') then raise exception 'Only an owner can delete'; end if;
  select * into p from public.parties where id = _id and deleted_at is null;
  if p is null then raise exception 'Not found (already deleted?)'; end if;
  if p.is_cash then raise exception 'Nakad Bikri is permanent and cannot be removed'; end if;
  update public.sale_items set deleted_at = ts
    where deleted_at is null and sale_id in (select id from public.sales where customer_id = _id and deleted_at is null);
  update public.sales set deleted_at = ts where customer_id = _id and deleted_at is null;
  update public.transactions set deleted_at = ts where party_id = _id and deleted_at is null;
  update public.production_entries set deleted_at = ts where party_id = _id and deleted_at is null;
  update public.kiln_entries set deleted_at = ts where party_id = _id and deleted_at is null;
  update public.salary_months set deleted_at = ts where party_id = _id and deleted_at is null;
  update public.party_rates set deleted_at = ts where party_id = _id and deleted_at is null;
  update public.purchases set deleted_at = ts where supplier_id = _id and deleted_at is null;
  update public.raw_store set deleted_at = ts where patheer_id = _id and deleted_at is null;
  update public.parties set deleted_at = ts, is_active = false where id = _id;
end;
$$;
grant execute on function public.delete_party(uuid) to authenticated;

-- A season only when nothing is entered in it (seasons are made automatically from dates).
create or replace function public.delete_season(_id uuid)
returns void language plpgsql set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'owner') then raise exception 'Only an owner can delete'; end if;
  if exists (select 1 from public.production_entries where season_id = _id and deleted_at is null)
     or exists (select 1 from public.kiln_entries where season_id = _id and deleted_at is null)
     or exists (select 1 from public.transactions where season_id = _id and deleted_at is null)
     or exists (select 1 from public.salary_months where season_id = _id and deleted_at is null)
     or exists (select 1 from public.sales where season_id = _id and deleted_at is null)
     or exists (select 1 from public.stock_adjustments where season_id = _id and deleted_at is null)
     or exists (select 1 from public.raw_store where season_id = _id and deleted_at is null)
     or exists (select 1 from public.purchases where season_id = _id and deleted_at is null) then
    raise exception 'This season has entries — delete them first, or close the season instead';
  end if;
  update public.parties set season_id = null where season_id = _id;
  update public.seasons set deleted_at = now() where id = _id and deleted_at is null;
end;
$$;
grant execute on function public.delete_season(uuid) to authenticated;

-- A brick type or roray only when it was never used; otherwise switch it off.
create or replace function public.delete_quality(_id uuid)
returns void language plpgsql set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'owner') then raise exception 'Only an owner can delete'; end if;
  if exists (select 1 from public.kiln_entries where quality_id = _id and deleted_at is null)
     or exists (select 1 from public.sale_items where quality_id = _id and deleted_at is null)
     or exists (select 1 from public.stock_adjustments where quality_id = _id and deleted_at is null)
     or exists (select 1 from public.qualities where stock_quality_id = _id and deleted_at is null) then
    raise exception 'This type is used in entries or sales — switch it off instead';
  end if;
  update public.qualities set deleted_at = now(), is_active = false where id = _id and deleted_at is null;
end;
$$;
grant execute on function public.delete_quality(uuid) to authenticated;

-- A gair: its entries stay but are no longer marked with it (move them to another gair if needed).
create or replace function public.delete_gair(_id uuid)
returns void language plpgsql set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'owner') then raise exception 'Only an owner can delete'; end if;
  update public.kiln_entries set gair_id = null where gair_id = _id and deleted_at is null;
  update public.gairs set deleted_at = now() where id = _id and deleted_at is null;
end;
$$;
grant execute on function public.delete_gair(uuid) to authenticated;

-- An expense category only when no entry uses it.
create or replace function public.delete_expense_category(_id uuid)
returns void language plpgsql set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'owner') then raise exception 'Only an owner can delete'; end if;
  if exists (select 1 from public.transactions where expense_category_id = _id and deleted_at is null) then
    raise exception 'Entries use this category — change them to another category first';
  end if;
  update public.expense_categories set deleted_at = now(), is_active = false where id = _id and deleted_at is null;
end;
$$;
grant execute on function public.delete_expense_category(uuid) to authenticated;
