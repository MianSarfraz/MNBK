<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All brick/money math lives in `src/lib/kiln-math.ts` as integer-only pure functions with tests in `src/test/kiln-math.test.ts`; UI and SQL views must match it (half-up rounding per entry).
- Every payment/kharcha is a row in the single `transactions` table; khattas are filtered views of it, so a payment is entered once.
- Balances are derived (SQL view `party_ledger` + client math), never stored; edits are soft deletes (`deleted_at`) and every change is captured by the `audit_row` trigger.
- Owner access is enforced by RLS via `has_role(auth.uid(),'owner')`; the first two accounts claim owner through `claim_owner_role()`, others see no-access.
- App pages read/write through the browser client under RLS inside `src/routes/_authenticated/` (ssr:false).
