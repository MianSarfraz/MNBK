CREATE OR REPLACE FUNCTION public.audit_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.audit_log (table_name, row_id, action, old_values, new_values, changed_by)
  values (
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id')::uuid,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$function$;