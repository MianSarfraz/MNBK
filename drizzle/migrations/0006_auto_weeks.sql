-- Weeks and seasons are created automatically from an entry's date; nobody has to set up a season first.
-- Season = 1 July → 30 June (named e.g. "2026-27"), clamped so it never overlaps a season someone created by hand.
-- Week = Thursday → Wednesday, numbered from the first Thursday on or before the season start.

create or replace function public.ensure_season(_d date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  y int;
  s date;
  e date;
begin
  if auth.uid() is not null and not public.has_role(auth.uid(), 'owner') then
    raise exception 'Not allowed';
  end if;
  sid := public.season_for_date(_d);
  if sid is not null then return sid; end if;
  perform pg_advisory_xact_lock(hashtext('mnb-ensure-season'));
  sid := public.season_for_date(_d);
  if sid is not null then return sid; end if;

  y := extract(year from _d)::int - case when extract(month from _d) < 7 then 1 else 0 end;
  s := make_date(y, 7, 1);
  e := make_date(y + 1, 6, 30);
  s := greatest(s, coalesce((select max(end_date) + 1 from public.seasons where deleted_at is null and end_date < _d and end_date >= s), s));
  e := least(e, coalesce((select min(start_date) - 1 from public.seasons where deleted_at is null and start_date > _d and start_date <= e), e));

  insert into public.seasons (name, start_date, end_date, created_by)
  values (y::text || '-' || right((y + 1)::text, 2), s, e, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'))
  returning id into sid;
  return sid;
end;
$$;

create or replace function public.ensure_week(_d date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  ws date;
  first_thu date;
  season_start date;
  wid uuid;
begin
  sid := public.ensure_season(_d);
  ws := _d - ((extract(dow from _d)::int - 4 + 7) % 7);
  select id into wid from public.weeks where season_id = sid and start_date = ws;
  if wid is not null then return wid; end if;
  select start_date into season_start from public.seasons where id = sid;
  first_thu := season_start - ((extract(dow from season_start)::int - 4 + 7) % 7);
  insert into public.weeks (season_id, week_number, start_date, end_date, created_by)
  values (sid, ((ws - first_thu) / 7) + 1, ws, ws + 6, coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'))
  on conflict (season_id, start_date) do nothing
  returning id into wid;
  if wid is null then
    select id into wid from public.weeks where season_id = sid and start_date = ws;
  end if;
  return wid;
end;
$$;

revoke execute on function public.ensure_season(date) from public;
revoke execute on function public.ensure_week(date) from public;
grant execute on function public.ensure_season(date) to authenticated;
grant execute on function public.ensure_week(date) to authenticated;

-- Fills week_id / season_id from entry_date (runs before the validation triggers: names sort first).
create or replace function public.fill_week()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.week_id is null
     or (tg_op = 'UPDATE' and new.entry_date is distinct from old.entry_date)
     or not exists (select 1 from public.weeks w where w.id = new.week_id and new.entry_date between w.start_date and w.end_date) then
    new.week_id := public.ensure_week(new.entry_date);
  end if;
  new.season_id := (select season_id from public.weeks where id = new.week_id);
  return new;
end;
$$;

create trigger a_fill_week before insert or update on public.production_entries for each row execute function public.fill_week();
create trigger a_fill_week before insert or update on public.kiln_entries for each row execute function public.fill_week();
