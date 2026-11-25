-- Brick types are owner-editable: anything added through the Qualities screen becomes a stock-tracked brick type.
-- Before this, the add form defaulted to the retired "sale name" list (never shown in stock), and every re-run of
-- setup.sql switched off any brick type outside the original seven. This repairs both, once.

do $fix$
declare
  zero uuid := '00000000-0000-0000-0000-000000000000';
  next_order int;
  r record;
begin
  if exists (select 1 from public.setup_steps where name = 'brick_types_editable') then return; end if;
  select coalesce(max(sort_order), 0) into next_order from public.qualities where kind = 'nakasi' and deleted_at is null;

  -- Types an owner added as "sale" (not linked to any stock): turn them into real brick types,
  -- or link them to the existing brick type with the same name.
  for r in select s.id, s.name_en,
                  (select n.id from public.qualities n where n.kind = 'nakasi' and n.deleted_at is null
                     and lower(btrim(n.name_en)) = lower(btrim(s.name_en)) limit 1) as same_name
           from public.qualities s
           where s.kind = 'sale' and s.deleted_at is null and s.stock_quality_id is null and s.created_by <> zero
           order by s.created_at loop
    if r.same_name is not null then
      update public.qualities set stock_quality_id = r.same_name, is_active = false where id = r.id;
      update public.qualities set is_active = true where id = r.same_name;
    else
      next_order := next_order + 1;
      update public.qualities set kind = 'nakasi', stock_quality_id = null, is_active = true, sort_order = next_order where id = r.id;
    end if;
  end loop;

  -- Brick types an owner added that a setup.sql re-run switched off: switch them back on.
  update public.qualities set is_active = true
  where kind = 'nakasi' and deleted_at is null and created_by <> zero and not is_active;

  insert into public.setup_steps (name) values ('brick_types_editable');
end $fix$;

-- No two brick types with the same name.
do $u$ begin
  create unique index if not exists qualities_unique_name on public.qualities (kind, lower(btrim(name_en))) where deleted_at is null;
exception when unique_violation then
  raise notice 'Duplicate brick type names already exist; rename one, then re-run to enforce unique names.';
end $u$;
