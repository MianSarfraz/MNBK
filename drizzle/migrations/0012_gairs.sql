-- Gairs (kiln rounds) you start and close. While a gair is open, every new rehra load and nakasi entry is marked
-- with it automatically. If two gairs are open at once (rehra filling the new round while nakasi still empties the
-- old one), rehra goes to the newest open gair and nakasi to the oldest. Any entry can be moved to another gair.
-- kiln_entries.firing_ref is kept in step with the gair's name so older screens and exports still read it.

create table public.gairs (
  id uuid primary key default gen_random_uuid(),
  number int not null check (number > 0),
  label text,
  started_on date not null,
  closed_on date,
  notes text,
  created_by uuid not null default auth.uid(),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (closed_on is null or closed_on >= started_on)
);
create unique index gairs_number_unique on public.gairs (number) where deleted_at is null;

create trigger touch_gairs before update on public.gairs for each row execute function public.touch_row();
create trigger audit_gairs after insert or update or delete on public.gairs for each row execute function public.audit_row();
GRANT SELECT, INSERT, UPDATE ON public.gairs TO authenticated;
GRANT ALL ON public.gairs TO service_role;
ALTER TABLE public.gairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read gairs" ON public.gairs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write gairs" ON public.gairs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update gairs" ON public.gairs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

alter table public.kiln_entries add column if not exists gair_id uuid references public.gairs(id);
create index if not exists kiln_entries_gair_id_idx on public.kiln_entries (gair_id) where deleted_at is null;

create or replace function public.gair_name(_number int, _label text)
returns text language sql immutable as $$ select coalesce(nullif(btrim(_label), ''), 'Gair ' || _number) $$;

-- New rehra / nakasi entries without a gair get the open gair; firing_ref always mirrors the gair's name.
create or replace function public.fill_gair()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.gair_id is null then
    select g.id into new.gair_id from public.gairs g
    where g.deleted_at is null and g.closed_on is null and g.started_on <= new.entry_date
    order by case when new.stage = 'rehra' then -g.number else g.number end
    limit 1;
  end if;
  if new.gair_id is not null then
    select public.gair_name(g.number, g.label) into new.firing_ref from public.gairs g where g.id = new.gair_id;
  elsif tg_op = 'UPDATE' and old.gair_id is not null then
    new.firing_ref := null;
  end if;
  return new;
end;
$$;
drop trigger if exists b_fill_gair on public.kiln_entries;
create trigger b_fill_gair before insert or update on public.kiln_entries for each row execute function public.fill_gair();

-- Renaming a gair renames it on its entries.
create or replace function public.rename_gair_entries()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.gair_name(new.number, new.label) is distinct from public.gair_name(old.number, old.label) then
    update public.kiln_entries set firing_ref = public.gair_name(new.number, new.label)
    where gair_id = new.id and not exists (select 1 from public.seasons s where s.id = kiln_entries.season_id and s.is_closed);
  end if;
  return new;
end;
$$;
drop trigger if exists rename_gair_entries on public.gairs;
create trigger rename_gair_entries after update on public.gairs for each row execute function public.rename_gair_entries();

-- One-time: gair names typed before become gairs (the latest stays open, earlier ones are closed on their last entry).
do $g$
declare
  r record;
  n int;
  latest uuid;
  gid uuid;
begin
  if exists (select 1 from public.setup_steps where name = 'gairs_from_firing_ref') then return; end if;
  for r in select lower(btrim(firing_ref)) as k, min(btrim(firing_ref)) as name, min(entry_date) as s, max(entry_date) as e
           from public.kiln_entries where deleted_at is null and gair_id is null and coalesce(btrim(firing_ref), '') <> ''
           group by 1 order by min(entry_date), 1 loop
    n := nullif(substring(r.name from '\d+'), '')::int;
    if n is null or n <= 0 or exists (select 1 from public.gairs where number = n and deleted_at is null) then
      select coalesce(max(number), 0) + 1 into n from public.gairs where deleted_at is null;
    end if;
    insert into public.gairs (number, label, started_on, closed_on, created_by)
    values (n, case when r.name ~* '^gair\s*\d+$' then null else r.name end, r.s, r.e, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'))
    returning id into gid;
    latest := gid;
    update public.kiln_entries k set gair_id = gid
    where lower(btrim(k.firing_ref)) = r.k and k.deleted_at is null and k.gair_id is null
      and not exists (select 1 from public.seasons s where s.id = k.season_id and s.is_closed);
  end loop;
  if latest is not null then update public.gairs set closed_on = null where id = latest; end if;
  insert into public.setup_steps (name) values ('gairs_from_firing_ref');
end $g$;

-- Gair check, now by gair: kacha loaded in vs pakki out, bricks and 9t tiles separately. Mirrors gairCheck().
drop view if exists public.gair_check;
create view public.gair_check
with (security_invoker = true) as
select g.id as gair_id, g.number, public.gair_name(g.number, g.label) as gair, g.started_on, g.closed_on,
       min(k.entry_date) as first_date, max(k.entry_date) as last_date,
       coalesce(sum(k.count) filter (where k.stage = 'rehra' and k.raw_type = 'brick'), 0)::bigint as loaded_bricks,
       coalesce(sum(k.count) filter (where k.stage = 'rehra' and k.raw_type = '9t'), 0)::bigint as loaded_9t,
       coalesce(sum(k.count) filter (where k.stage = 'rehra' and k.from_store), 0)::bigint as loaded_from_store,
       coalesce(sum(k.count) filter (where k.stage = 'nakasi' and q.category <> 'nine_t'), 0)::bigint as produced_bricks,
       coalesce(sum(k.count) filter (where k.stage = 'nakasi' and q.category = 'nine_t'), 0)::bigint as produced_9t,
       (coalesce(sum(k.count) filter (where k.stage = 'rehra' and k.raw_type = 'brick'), 0)
        - coalesce(sum(k.count) filter (where k.stage = 'nakasi' and q.category <> 'nine_t'), 0))::bigint as diff_bricks,
       (coalesce(sum(k.count) filter (where k.stage = 'rehra' and k.raw_type = '9t'), 0)
        - coalesce(sum(k.count) filter (where k.stage = 'nakasi' and q.category = 'nine_t'), 0))::bigint as diff_9t
from (select id, number, label, started_on, closed_on from public.gairs where deleted_at is null
      union all select null, null, null, null, null) g
left join public.kiln_entries k on k.deleted_at is null and k.gair_id is not distinct from g.id
left join public.qualities q on q.id = k.quality_id
group by g.id, g.number, g.label, g.started_on, g.closed_on;

GRANT SELECT ON public.gair_check TO authenticated, service_role;
