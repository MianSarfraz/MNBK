## Architecture rules
- All brick/money math lives in `src/lib/kiln-math.ts` as integer-only pure functions with tests in `src/test/kiln-math.test.ts`; UI and SQL views must match it (half-up rounding per entry).
- Every payment/kharcha is a row in the single `transactions` table; khattas are filtered views of it, so a payment is entered once.
- Balances are derived (SQL view `party_ledger` + client math), never stored; edits are soft deletes (`deleted_at`) and every change is captured by the `audit_row` trigger.
- Owner access is enforced by RLS via `has_role(auth.uid(),'owner')`; the first two accounts claim owner through `claim_owner_role()`, others see no-access.
- Next.js App Router: `src/app/(app)/*/page.tsx` are thin server pages (metadata) rendering client views in `src/views/`; data is read/written through the browser Supabase client (`@/integrations/supabase/client`) under RLS. `src/middleware.ts` refreshes the cookie session and redirects signed-out visitors to `/auth`.
