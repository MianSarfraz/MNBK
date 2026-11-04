create type public.app_role as enum ('owner', 'munshi');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- Only profiles and user_roles may reference auth.users
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- First two accounts to register become owners (bootstrap for the two brothers).
create or replace function public.claim_owner_role()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_count int;
begin
  perform pg_advisory_xact_lock(hashtext('mnb-owner-claim'));
  if not exists (select 1 from public.user_roles where user_id = auth.uid()) then
    select count(*) into owner_count from public.user_roles where role = 'owner';
    if owner_count < 2 then
      insert into public.user_roles (user_id, role) values (auth.uid(), 'owner');
      return true;
    end if;
  end if;
  return exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'owner');
end;
$$;
revoke execute on function public.claim_owner_role() from public;
grant execute on function public.claim_owner_role() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
