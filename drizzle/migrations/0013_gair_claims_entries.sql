-- Starting a gair (or moving its dates) adds the entries already made in its dates that have no gair yet.
-- Before, only entries saved after pressing "Start" were marked, so loads entered earlier that day were left out.
-- Same rule as for new entries: rehra → the newest gair covering the date, nakasi → the oldest.
create or replace function public.assign_gairs(_from date, _to date)
returns void language plpgsql set search_path = public as $$
begin
  update public.kiln_entries k
  set gair_id = (
    select g.id from public.gairs g
    where g.deleted_at is null and k.entry_date >= g.started_on and (g.closed_on is null or k.entry_date <= g.closed_on)
    order by case when k.stage = 'rehra' then -g.number else g.number end
    limit 1)
  where k.gair_id is null and k.deleted_at is null
    and k.entry_date >= coalesce(_from, '1900-01-01') and k.entry_date <= coalesce(_to, '2999-12-31')
    and exists (select 1 from public.gairs g where g.deleted_at is null and k.entry_date >= g.started_on
                and (g.closed_on is null or k.entry_date <= g.closed_on))
    and not exists (select 1 from public.seasons s where s.id = k.season_id and s.is_closed);
end;
$$;

create or replace function public.gair_claim_entries()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.deleted_at is null and (tg_op = 'INSERT' or new.started_on is distinct from old.started_on or new.closed_on is distinct from old.closed_on) then
    perform public.assign_gairs(new.started_on, new.closed_on);
  end if;
  return null;
end;
$$;
drop trigger if exists gair_claim_entries on public.gairs;
create trigger gair_claim_entries after insert or update on public.gairs for each row execute function public.gair_claim_entries();

-- One-time: gairs already started pick up their unmarked entries.
do $c$ begin
  if exists (select 1 from public.setup_steps where name = 'gair_claim_entries') then return; end if;
  perform public.assign_gairs(null, null);
  insert into public.setup_steps (name) values ('gair_claim_entries');
end $c$;
