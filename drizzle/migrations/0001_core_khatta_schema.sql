-- ====== ENUMS ======
create type public.quality_kind as enum ('sale', 'nakasi');
create type public.quality_category as enum ('normal', 'nine_t', 'special', 'other');
create type public.party_kind as enum ('patheer', 'rehra', 'nakasi', 'employee', 'customer', 'vendor');
create type public.rate_kind as enum ('earning', 'kharcha');
create type public.txn_kind as enum ('kharcha', 'expense', 'salary', 'worker_payment_us', 'worker_payment_them', 'sale_receipt', 'adjustment', 'other');
create type public.txn_direction as enum ('in', 'out');
create type public.pay_method as enum ('cash', 'bank', 'easypaisa', 'jazzcash', 'other');

-- ====== SEASONS ======
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  is_closed boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ====== WEEKS (Thursday to Wednesday) ======
create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id),
  week_number int not null,
  start_date date not null,
  end_date date not null check (end_date = start_date + 6),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (season_id, start_date)
);
create index weeks_season_idx on public.weeks (season_id, start_date);

-- ====== QUALITIES ======
create table public.qualities (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ur text not null,
  kind public.quality_kind not null,
  category public.quality_category not null default 'normal',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ====== PARTIES ======
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  kind public.party_kind not null,
  name text not null,
  phone text,
  party_type text,
  season_id uuid references public.seasons(id) on delete set null,
  opening_balance bigint not null default 0,
  is_active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index parties_kind_idx on public.parties (kind) where deleted_at is null;

-- ====== RATES with effective dates ======
create table public.party_rates (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id),
  kind public.rate_kind not null,
  rate_per_1000 bigint not null check (rate_per_1000 > 0),
  effective_from date not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (party_id, kind, effective_from)
);
create index party_rates_party_idx on public.party_rates (party_id, kind, effective_from);

-- ====== PRODUCTION ENTRIES (patheer/rehra/nakasi weekly work) ======
create table public.production_entries (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id),
  season_id uuid not null references public.seasons(id),
  week_id uuid not null references public.weeks(id),
  entry_date date not null,
  estimated_count bigint not null default 0 check (estimated_count >= 0),
  confirmed_count bigint check (confirmed_count >= 0),
  confirmed_at timestamptz,
  notes text,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (party_id, entry_date)
);
create index production_week_idx on public.production_entries (week_id);
create index production_party_idx on public.production_entries (party_id, entry_date);

-- ====== CENTRAL TRANSACTIONS ======
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  season_id uuid references public.seasons(id),
  week_id uuid references public.weeks(id),
  party_id uuid references public.parties(id),
  kind public.txn_kind not null,
  direction public.txn_direction not null,
  amount bigint not null check (amount > 0),
  method public.pay_method not null default 'cash',
  handler_user_id uuid not null,
  category text not null default 'other',
  note text,
  receipt_url text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index txn_party_idx on public.transactions (party_id) where deleted_at is null;
create index txn_season_idx on public.transactions (season_id) where deleted_at is null;
create index txn_date_idx on public.transactions (entry_date) where deleted_at is null;

-- ====== EXPENSE CATEGORIES ======
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ur text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ====== AUDIT LOG (append only) ======
create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index audit_row_idx on public.audit_log (table_name, row_id, id);

-- ====== GRANTS ======
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weeks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parties TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.seasons, public.weeks, public.qualities, public.parties, public.party_rates, public.production_entries, public.transactions, public.expense_categories, public.audit_log TO service_role;

-- ====== RLS ======
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners read seasons" ON public.seasons FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write seasons" ON public.seasons FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update seasons" ON public.seasons FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners delete seasons" ON public.seasons FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read weeks" ON public.weeks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write weeks" ON public.weeks FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update weeks" ON public.weeks FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners delete weeks" ON public.weeks FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read qualities" ON public.qualities FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write qualities" ON public.qualities FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update qualities" ON public.qualities FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners delete qualities" ON public.qualities FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read parties" ON public.parties FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write parties" ON public.parties FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update parties" ON public.parties FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners delete parties" ON public.parties FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read rates" ON public.party_rates FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write rates" ON public.party_rates FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update rates" ON public.party_rates FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners delete rates" ON public.party_rates FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read production" ON public.production_entries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write production" ON public.production_entries FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update production" ON public.production_entries FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners delete production" ON public.production_entries FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read transactions" ON public.transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write transactions" ON public.transactions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update transactions" ON public.transactions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners delete transactions" ON public.transactions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read categories" ON public.expense_categories FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners write categories" ON public.expense_categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners update categories" ON public.expense_categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'owner'));
CREATE POLICY "owners delete categories" ON public.expense_categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "owners read audit" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'));
