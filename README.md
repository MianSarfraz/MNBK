# Mian Nawaz Bricks — kiln khatta

Urdu-first (RTL, English toggle), mobile-first brick-kiln management: patheer, rehra, nakasi, sales, stock,
expense and owner khattas, organised by Thursday–Wednesday weeks within seasons.

Built with [Lovable](https://lovable.dev/projects/c7208240-a98b-4c29-bfd1-93eb96db1bb8) — TanStack Start (React + TypeScript),
Lovable Cloud (Postgres + auth + storage, RLS), Tailwind.

## Screens

| Route | What it does |
| --- | --- |
| `/weekly` | Patheer register: estimated → confirmed per day, earnings, weekly kharcha. Autosaves; unsaved cells are queued on the device and retried. |
| `/rehra`, `/nakasi` | Weekly loads into / baked output out of the kiln, earnings and kharcha per worker. |
| `/people/:kind`, `/party/:id` | Every person (patheer, rehra, nakasi, employee, customer, vendor): balance, running ledger, period statements (week / month / season / custom), settle-now, payments, rates, salary posting, print / PDF. |
| `/sales`, `/sales/new`, `/sales/:id` | Multi-quality invoices with vehicle / driver, money received now, stock warning, printable Urdu invoice, later payments. |
| `/stock` | Finished stock per quality (nakasi − sales ± adjustments), raw stock at the yard (confirmed − loaded ± adjustments). |
| `/expenses` | The central transactions table: every payment in and out, expenses with categories and receipt photos, owner transfers. |
| `/owners` | Each brother's paid / received / net, 50/50 settlement between them, cash-in-hand vs counted cash. |
| `/reports` | Season profit & loss, outstanding balances, statements, Excel export, one-click full export (JSON + Excel). |
| `/history` | Audit log of every change with old / new values. |

## Accuracy rules

- All brick and money math is integer-only and lives in `src/lib/kiln-math.ts` (tested in `src/test/`).
  Line amounts are `count × rate / 1000`, rounded half-up per entry.
- Balance sign everywhere: **positive = we owe the party, negative = the party owes us.**
- Balances and stock are always derived (SQL views `party_ledger`, `sale_totals`, `finished_stock`, `raw_stock`
  mirror the TypeScript functions); nothing is hard-deleted (soft delete + `audit_log`); closed seasons are read-only.

## Database

Migrations are in `drizzle/migrations/`. `0005_phase2_4_khattas.sql` adds kiln entries, salaries, sales, stock
adjustments, cash counts, the receipts bucket and the views above. Apply it before using the new screens.

## Development

```sh
npm i        # or bun install
npm run dev
npm test     # math, ledger, export, routing and page smoke tests
```
