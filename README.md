# Mian Nawaz Bricks — kiln khatta

Mobile-first brick-kiln management (English): patheer, rehra, nakasi, sales, stock,
expense and owner khattas, organised by Thursday–Wednesday weeks. Weeks and seasons (1 July – 30 June) are created automatically from entry dates — nothing to set up.

Stack: Next.js 15 (App Router, React 19, TypeScript), Supabase (Postgres + auth + storage, RLS, cookie sessions via `@supabase/ssr`), Tailwind CSS 4.

## Screens

**Sales & stock (main)**

| Route | What it does |
| --- | --- |
| `/dashboard` | Stock per brick type, today's / this month's sales, outstanding, top customers, charts. |
| `/sales` | Sales register sheet: one row per sale line (S-0001…), stock checked before saving; Nakad Bikri auto-paid. |
| `/payments` | Payments register sheet (P-0001…): customer, amount, method, reference. |
| `/customers`, `/customers/[id]` | Customer master (C-001…, no duplicates) and each customer's purchases, payments and outstanding / advance. |
| `/stock`, `/stock/opening`, `/production` | Stock summary per brick type; opening stock; production register by kiln firing. |
| `/sales-reports` | Sales by day / week / month / year, by customer and type; production by firing; customer balances. |

Brick types: Awal, Awal Machine, Doum, Tirak, 9t, 9t Doum, 9t Tirak — each with its own stock
(remaining = opening + production − sold ± adjustments).

**Kiln work, money & settings (secondary):** `/weekly` (patheer), `/rehra`, `/nakasi`, `/people/[kind]`, `/party/[id]`,
`/expenses`, `/owners`, `/reports`, `/qualities`, `/seasons`, `/history`.

## Accuracy rules

- All brick and money math is integer-only and lives in `src/lib/kiln-math.ts` (tested in `src/test/`).
  Line amounts are `count × rate / 1000`, rounded half-up per entry.
- Balance sign everywhere: **positive = we owe the party, negative = the party owes us.**
- Balances and stock are always derived (SQL views `party_ledger`, `sale_totals`, `finished_stock`, `raw_stock`
  mirror the TypeScript functions); nothing is hard-deleted (soft delete + `audit_log`); closed seasons are read-only.

## Database

Migrations are in `drizzle/migrations/`. `0005_phase2_4_khattas.sql` adds kiln entries, salaries, sales, stock
adjustments, cash counts, the receipts bucket and the views above. Apply all migrations in order on a new database.

## Setup

1. Copy `.env.example` to `.env` and set your Supabase project:
   ```
   NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_…"
   ```
2. On an empty project, run `supabase/setup.sql` once in the Supabase SQL editor (it contains every migration). If you ran an older
   setup.sql, run just the newer migration files (e.g. `drizzle/migrations/0006_auto_weeks.sql`). Or use
   `DATABASE_URL=postgres://… npx drizzle-kit migrate`.
3. Sign up both owners — Sarfraz and Muhammad Nawaz (the first two accounts become owners) — then turn off sign-ups in Supabase Auth settings.

## Development

```sh
npm install
npm run dev        # http://localhost:8080
npm test           # math, database scenarios (real Postgres via PGlite), and screen tests
npm run typecheck
npm run build      # production build
npm start          # serve the production build
```

Deploy anywhere Next.js runs (Vercel is zero-config): set the two `NEXT_PUBLIC_SUPABASE_*` variables and, in
Supabase → Authentication → URL configuration, add your site URL so confirmation emails link back correctly.

## Layout

- `src/app/` — routes. `(app)/` pages share the signed-in shell; `auth/` is the only public page.
- `src/views/` — client screens; `src/components/` — shared UI (ledger, lists, kiln week, form kit).
- `src/lib/kiln-math.ts` — all money/brick math; `src/integrations/supabase/` — clients, middleware helper, types.
- `src/middleware.ts` — session refresh + redirect to `/auth`.
