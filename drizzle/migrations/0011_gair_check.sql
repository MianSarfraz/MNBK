-- Gair check: each gair (kiln round) compares the kacha bricks rehra loaded into it with the pakki bricks that came
-- out (production register), separately for bricks and 9t tiles. Both sides use kiln_entries.firing_ref as the gair.
-- Kacha-store bricks count in a gair only once rehra loads them into it; unused store bricks stay out of every gair.
create index if not exists kiln_entries_gair_idx on public.kiln_entries (lower(btrim(firing_ref))) where deleted_at is null;

create or replace view public.gair_check
with (security_invoker = true) as
select lower(btrim(coalesce(k.firing_ref, ''))) as gair_key,
       min(btrim(coalesce(k.firing_ref, ''))) as gair,
       min(k.entry_date) as first_date,
       max(k.entry_date) as last_date,
       coalesce(sum(k.count) filter (where k.stage = 'rehra' and k.raw_type = 'brick'), 0)::bigint as loaded_bricks,
       coalesce(sum(k.count) filter (where k.stage = 'rehra' and k.raw_type = '9t'), 0)::bigint as loaded_9t,
       coalesce(sum(k.count) filter (where k.stage = 'rehra' and k.from_store), 0)::bigint as loaded_from_store,
       coalesce(sum(k.count) filter (where k.stage = 'nakasi' and q.category <> 'nine_t'), 0)::bigint as produced_bricks,
       coalesce(sum(k.count) filter (where k.stage = 'nakasi' and q.category = 'nine_t'), 0)::bigint as produced_9t,
       (coalesce(sum(k.count) filter (where k.stage = 'rehra' and k.raw_type = 'brick'), 0)
        - coalesce(sum(k.count) filter (where k.stage = 'nakasi' and q.category <> 'nine_t'), 0))::bigint as diff_bricks,
       (coalesce(sum(k.count) filter (where k.stage = 'rehra' and k.raw_type = '9t'), 0)
        - coalesce(sum(k.count) filter (where k.stage = 'nakasi' and q.category = 'nine_t'), 0))::bigint as diff_9t
from public.kiln_entries k
left join public.qualities q on q.id = k.quality_id
where k.deleted_at is null
group by 1;

GRANT SELECT ON public.gair_check TO authenticated, service_role;
