# Mian Nawaz Bricks — Kiln Management App Plan

Urdu-first, mobile-first management app for the kiln: patheer, rehra, nakasi,
sales, stock and expense khattas, seasons and Thursday–Wednesday weeks, with
exact integer money math and a full audit trail.

Stack: TanStack Start (React + TypeScript), Lovable Cloud backend (database,
auth, storage), Tailwind. All amounts and brick counts are integers (whole
rupees, whole bricks) — never floats. Balances are always computed from
entries, never stored as editable numbers. Nothing is hard-deleted (soft
delete + audit log of old/new values). Every record stores who created/edited it.

Decisions from you: restricted sign-up (only the two owners can get accounts,
no open registration), pause for your review after the patheer khatta, no demo
data, English numerals by default.

## Phase 1 — build first (this is what you review)

1. **Backend setup** — enable Lovable Cloud, email/password sign-in, owner
   accounts for M. Nawaz and Sarfraz Nawaz with an owner role, then close
   public sign-up so only you two (and later a munshi you add) can sign in.
2. **Database schema** (migration with GRANTs, RLS, indexes):
   - `seasons` (name, start/end date, closed flag — closed seasons read-only)
   - `weeks` (auto-generated per season, Thursday–Wednesday, unique per season)
   - `qualities` (Urdu + English name, category: normal/9T/special/other, kind:
     sales-stock vs nakasi, active flag) — seeded with your full lists
   - `parties` (patheer / rehra / nakasi / employee / customer / vendor; name,
     phone, type, season, opening balance)
   - `party_rates` (rate per 1000 and kharcha rate per 1000, each with
     effective-from dates — changing a rate never rewrites old weeks)
   - `production_entries` (patheer, week, day, estimated count, confirmed
     count, confirmed-at, notes)
   - `transactions` — ONE central ledger table (date, amount, direction
     in/out, paid/received by whom, category, linked party, method, note,
     receipt photo) that every other khatta filters; patheer weekly kharcha
     posts here automatically
   - `audit_log` (table, row, old/new values, actor, time) — append-only
3. **Screens (Urdu-first RTL, English toggle, big touch targets):**
   - Login + restricted sign-up screen; owner account menu
   - Seasons and weeks management (auto-generate weeks per season)
   - Qualities manager (add / edit / deactivate)
   - Patheer master (add, edit, deactivate, rates with effective dates,
     opening balance)
   - **Weekly grid** — rows = patheer, columns = Thu…Wed, spreadsheet-style
     with Tab-to-next-cell, autosave and retry on weak internet; estimated
     entry on the day, confirmed entry later, differences highlighted,
     pending days shown, earnings computed from confirmed only
   - Weekly kharcha entry per patheer (estimated bricks × kharcha rate)
   - Patheer ledger — running balance after every entry, we-owe / he-owe
     status, season settlement statement with partial payments, printable
     Urdu statement
4. **Accuracy tests** — settlement math tests including your worked example:
   rate 1600/1000, kharcha 1300/1000, 50,000 estimated, 48,500 confirmed →
   earnings 77,600, kharcha 65,000, we owe him 12,600. Rate-date correctness,
   soft-delete and audit-log coverage.

## Phase 2 — expense ledger, rehra, nakasi
- Expense khatta screens over the central transactions table: categories
  (coal/fuel, diesel, repairs, electricity, transport, misc — editable list),
  salaries with employee ledgers, each brother's personal tab (paid, received,
  net position, who owes whom), cash-in-hand reconciliation.
- Rehra khatta: weekly load entry (optionally by quality/source patheer),
  ledger, settlement; reconciliation report (made vs loaded vs raw stock).
- Nakasi khatta: weekly baked-out entry by quality, ledger, settlement;
  output feeds finished stock.

## Phase 3 — sales, customers, stock
- Customer master, multi-quality invoices (vehicle, driver, payment now by
  cash/bank/easypaisa/jazzcash, who received it), later payments, customer
  ledger, outstanding report, stock warning on oversell, printable Urdu invoice.
- Stock: finished stock per quality (nakasi out − sales) with reasoned manual
  adjustments; raw stock (confirmed made − loaded).

## Phase 4 — dashboard, reports, safety net
- Dashboard: current week summary, totals owed each way.
- Season P&L; per-person statements filterable by week/month/season, export to
  PDF and Excel; one-click full export; automatic daily database backup.
- Optional munshi role with limited access.
- Polish: Urdu numeral toggle, confirm dialogs on anything changing balances.

## Design notes
- Noto Nastaliq Urdu font, RTL default with English toggle, warm paper-like
  register look (not a generic admin dashboard), large number inputs.
- Server logic runs as protected server functions validated by session; the
  database rules make sure only owners can read or write anything.
