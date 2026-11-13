# Continue Mian Nawaz Bricks — Phases 2–4

## Goal
Continue the kiln register after Phase 1, building expense, rehra, nakasi, sales, stock, and reporting workflows without changing the existing integer-only balances, single transactions ledger, soft-delete, audit, owner access, or Urdu-first conventions.

## Phase 2 — expenses, rehra, nakasi
- Add an expense khatta using the existing expense categories and central transactions; support expenses, salaries, employee ledgers, each brother’s personal paid/received position, and cash-in-hand reconciliation.
- Add weekly rehra totals by brick quality, with an optional source patheer; show loads and reconcile raw stock against confirmed production.
- Add weekly nakasi output totals by quality; show output in finished stock and allow season/party ledger review where applicable.
- Add only the necessary additive database changes, with owner-only RLS, grants, audit coverage, and soft-delete behavior.

## Phase 3 — sales, customers, stock
- Add customer records and multi-quality sales invoices with vehicle/driver details, payment method, receiving owner, and partial/later payments recorded in the existing transactions ledger.
- Add customer balances/outstanding views, printable Urdu invoices, finished stock by quality, raw stock reconciliation, and oversell warnings.
- Record manual stock adjustments with a reason; derive stock from entries rather than editable balance fields.

## Phase 4 — reports and safety
- Add season profit-and-loss and per-person statements filterable by week, month, and season; provide printable/PDF and spreadsheet exports plus a one-click application-data export.
- Preserve and polish the dashboard’s current-week totals and balances; add the Urdu numeral option and balance-change confirmations where missing.
- Use Lovable Cloud’s existing daily database snapshots rather than building a second backup mechanism. Do not claim storage files are included in database backups.

## Validation
- Add focused tests for any new stock and ledger math, including confirmed-made minus loaded raw stock, nakasi output minus sales finished stock, and integer-only amounts/counts.
- Exercise the new owner-facing workflows against the connected backend, verify balances and stock read back from saved entries, and check desktop/mobile layouts.

## Technical approach
- Keep app pages under the existing authenticated, client-only owner area and continue using the browser database client under RLS.
- Use the existing `transactions` table for every payment or kharcha; add separate records only for non-payment business documents such as invoices or weekly quality totals.
- Apply additive schema changes through the Lovable database migration workflow, including explicit grants, owner RLS policies, soft-delete fields where needed, and audit triggers.
- Keep amounts and counts as integers, balances and inventory derived, and Urdu/English labels in the existing translation system.