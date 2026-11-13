# Kiln app roadmap

- [x] Phase 1: patheer weekly register, kharcha, ledger, rates, seasons, and qualities.
- [x] Phase 2: expense khatta, employee and owner ledgers, cash reconciliation, weekly rehra loads, weekly nakasi output, and raw/finished stock reconciliation.
- [x] Phase 3: customers, multi-quality sales invoices and payments, customer balances, stock warnings, and printable invoices.
- [x] Phase 4: season and party reports, PDF (print) / Excel exports, full export, Urdu numerals, edit history. Daily database backups come from Supabase (paid plans); receipt photos are not part of the in-app export.
- [ ] Later: munshi (data-entry) role with limited access.

Decisions: Rehra entries are weekly totals with optional quality and source patheer; nakasi entries are weekly totals by quality.
Each sale quality is linked to a nakasi (stock) quality on the Qualities page; unlinked sale qualities are not stock-tracked.
The brothers' settlement assumes equal (50/50) partners.
