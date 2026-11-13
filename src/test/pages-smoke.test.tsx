// Mounts every owner page through the real router against an in-memory fake of the database client,
// so a render-time crash on any screen fails the build. No network is used.
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const U1 = "11111111-1111-1111-1111-111111111111";
const S1 = "season-1", W1 = "week-1", P1 = "patheer-1", C1 = "customer-1", E1 = "employee-1", N1 = "nakasi-1", R1 = "rehra-1";
const QA = "q-awal-n", QS = "q-awal-s", SALE = "sale-1";
const base = { created_at: "2026-11-05T00:00:00Z", updated_at: "2026-11-05T00:00:00Z", created_by: U1, updated_by: null, deleted_at: null };
const party = (id: string, kind: string, name: string, extra = {}) => ({
  ...base, id, kind, name, phone: "0300", address: null, party_type: "simple", season_id: S1, opening_balance: 0, monthly_salary: 0, is_active: true, ...extra,
});
const DB: Record<string, Record<string, unknown>[]> = {
  user_roles: [{ user_id: U1, role: "owner" }],
  profiles: [{ id: U1, display_name: "M. Nawaz" }],
  seasons: [{ ...base, id: S1, name: "2026-27", start_date: "2026-11-05", end_date: "2027-06-30", is_closed: false }],
  weeks: [{ id: W1, season_id: S1, week_number: 1, start_date: "2026-11-12", end_date: "2026-11-18", created_by: U1, created_at: base.created_at }],
  qualities: [
    { ...base, id: QA, name_en: "Awal", name_ur: "اول", kind: "nakasi", category: "normal", is_active: true, sort_order: 1, stock_quality_id: null },
    { ...base, id: QS, name_en: "Awal", name_ur: "اول", kind: "sale", category: "normal", is_active: true, sort_order: 2, stock_quality_id: QA },
  ],
  expense_categories: [{ ...base, id: "cat-1", name_en: "Diesel", name_ur: "ڈیزل", is_active: true, sort_order: 1 }],
  parties: [party(P1, "patheer", "Akram"), party(C1, "customer", "Bashir", { opening_balance: -1000 }), party(E1, "employee", "Munshi", { monthly_salary: 30000 }), party(N1, "nakasi", "Nadeem"), party(R1, "rehra", "Rafiq")],
  party_rates: [
    { ...base, id: "r1", party_id: P1, kind: "earning", rate_per_1000: 1600, effective_from: "2026-11-01" },
    { ...base, id: "r2", party_id: P1, kind: "kharcha", rate_per_1000: 1300, effective_from: "2026-11-01" },
    { ...base, id: "r3", party_id: N1, kind: "earning", rate_per_1000: 250, effective_from: "2026-11-01" },
  ],
  production_entries: [{ ...base, id: "pe1", party_id: P1, season_id: S1, week_id: W1, entry_date: "2026-11-12", estimated_count: 50000, confirmed_count: 48500, confirmed_at: null, notes: null }],
  kiln_entries: [
    { ...base, id: "k1", stage: "nakasi", party_id: N1, season_id: S1, week_id: W1, entry_date: "2026-11-13", quality_id: QA, source_party_id: null, count: 30000, notes: null },
    { ...base, id: "k2", stage: "rehra", party_id: R1, season_id: S1, week_id: W1, entry_date: "2026-11-13", quality_id: null, source_party_id: P1, count: 40000, notes: null },
  ],
  salary_months: [{ ...base, id: "sm1", party_id: E1, season_id: S1, entry_date: "2026-11-01", amount: 30000, note: null }],
  sales: [{ ...base, id: SALE, invoice_no: 1, entry_date: "2026-11-14", season_id: S1, customer_id: C1, vehicle_no: "ABC-1", driver_name: "D", discount: 0, delivery_charges: 0, note: null }],
  sale_items: [{ ...base, id: "si1", sale_id: SALE, quality_id: QS, quantity: 10000, rate_per_1000: 14500 }],
  sale_totals: [{ sale_id: SALE, invoice_no: 1, customer_id: C1, entry_date: "2026-11-14", season_id: S1, gross: 145000, bricks: 10000, discount: 0, delivery_charges: 0, total: 145000 }],
  transactions: [
    { ...base, id: "t1", entry_date: "2026-11-13", season_id: S1, week_id: W1, party_id: P1, kind: "kharcha", direction: "out", amount: 65000, method: "cash", handler_user_id: U1, category: "patheer", note: null, receipt_url: null, sale_id: null, to_user_id: null, expense_category_id: null },
    { ...base, id: "t2", entry_date: "2026-11-14", season_id: S1, week_id: null, party_id: C1, kind: "sale_receipt", direction: "in", amount: 100000, method: "cash", handler_user_id: U1, category: "sale", note: null, receipt_url: null, sale_id: SALE, to_user_id: null, expense_category_id: null },
    { ...base, id: "t3", entry_date: "2026-11-14", season_id: S1, week_id: null, party_id: null, kind: "expense", direction: "out", amount: 5000, method: "cash", handler_user_id: U1, category: "expense", note: "diesel", receipt_url: null, sale_id: null, to_user_id: null, expense_category_id: "cat-1" },
  ],
  party_ledger: [
    { party_id: P1, party_kind: "patheer", balance: 12600 },
    { party_id: C1, party_kind: "customer", balance: -46000 },
  ],
  finished_stock: [{ quality_id: QA, name_en: "Awal", name_ur: "اول", category: "normal", produced: 30000, sold: 10000, adjusted: 0, balance: 20000 }],
  raw_stock: [{ made: 48500, loaded: 40000, adjusted: 0, balance: 8500 }],
  stock_adjustments: [],
  cash_counts: [],
  audit_log: [{ id: 1, table_name: "transactions", row_id: "t1", action: "UPDATE", old_values: { amount: 1 }, new_values: { amount: 2 }, changed_by: U1, changed_at: base.created_at }],
};

/** Chainable stand-in for the PostgREST query builder: filters `eq` on known columns, ignores the rest. */
function builder(table: string) {
  let rows = [...(DB[table] ?? [])];
  let single = false;
  const b: Record<string, unknown> = {};
  const chain = (fn?: () => void) => () => { fn?.(); return b; };
  for (const m of ["select", "is", "in", "order", "gte", "lte", "not", "limit", "range", "insert", "update", "upsert"]) b[m] = chain();
  b["eq"] = (col: string, val: unknown) => { rows = rows.filter((r) => !(col in r) || r[col] === val); return b; };
  b["single"] = chain(() => (single = true));
  b["maybeSingle"] = chain(() => (single = true));
  b["then"] = (res: (v: unknown) => unknown) => Promise.resolve(single ? { data: rows[0] ?? null, error: null } : { data: rows, error: null }).then(res);
  return b;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => builder(t),
    rpc: async () => ({ data: true, error: null }),
    auth: {
      getUser: async () => ({ data: { user: { id: U1 } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    storage: { from: () => ({}) },
  },
}));

afterEach(cleanup);

async function mount(path: string) {
  const { routeTree } = await import("@/routeTree.gen");
  // jsdom can't host the <html> document shell or wait on stylesheets; render the app body only.
  const opts = routeTree.options as unknown as Record<string, unknown>;
  opts["shellComponent"] = undefined;
  opts["head"] = undefined;
  const errors: unknown[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(a); });
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, history: createMemoryHistory({ initialEntries: [path] }) });
  render(<RouterProvider router={router} />);
  return { errors, spy };
}

const PAGES: [string, RegExp][] = [
  ["/dashboard", /اس ہفتے/],
  ["/weekly", /ہفتہ وار رجسٹر/],
  ["/patheer", /Akram/],
  ["/rehra", /رہڑا کھاتہ/],
  ["/nakasi", /نکاسی کھاتہ/],
  ["/sales", /Bashir/],
  ["/sales/new", /بل محفوظ کریں/],
  [`/sales/${SALE}`, /بل کی کل رقم/],
  ["/stock", /پکی اینٹوں کا اسٹاک/],
  ["/expenses", /خرچ کھاتہ/],
  ["/owners", /بھائیوں کے درمیان حساب|مالکان کا حساب/],
  ["/reports", /نفع و نقصان/],
  ["/history", /تبدیلیوں کا ریکارڈ/],
  ["/seasons", /2026-27/],
  ["/qualities", /اسٹاک سے/],
  ["/people/customer", /Bashir/],
  ["/people/employee", /Munshi/],
  [`/party/${P1}`, /حساب کا گوشوارہ/],
  [`/party/${C1}`, /حساب کا گوشوارہ/],
  [`/party/${E1}`, /مہینے کی تنخواہ درج کریں/],
  [`/party/${N1}`, /حساب کا گوشوارہ/],
];

describe("every page renders with data", () => {
  it.each(PAGES)("%s", async (path, expected) => {
    const { errors, spy } = await mount(path);
    await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(screen.queryByText(/This page didn't load/)).toBeNull();
    spy.mockRestore();
    const real = errors.filter((e) => !/not wrapped in act|validateDOMNesting|cannot be a child|cannot contain a nested/i.test(String((e as unknown[])[0])));
    expect(real).toEqual([]);
  });
});

describe("ledger screens show the right numbers", () => {
  it("patheer worked example: 48,500 confirmed × 1600 − 65,000 kharcha = we owe 12,600", async () => {
    const { spy } = await mount(`/party/${P1}`);
    await waitFor(() => expect(screen.getAllByText("77,600").length).toBeGreaterThan(0), { timeout: 4000 });
    expect(screen.getAllByText("12,600").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ہم نے دینا ہے").length).toBeGreaterThan(0);
    spy.mockRestore();
  });
  it("customer: opening 1,000 + invoice 145,000 − paid 100,000 = he owes 46,000", async () => {
    const { spy } = await mount(`/party/${C1}`);
    await waitFor(() => expect(screen.getAllByText("46,000").length).toBeGreaterThan(0), { timeout: 4000 });
    expect(screen.getAllByText("اس نے دینا ہے").length).toBeGreaterThan(0);
    spy.mockRestore();
  });
  it("invoice page: 10,000 @ 14,500 = 145,000, received 100,000, due 45,000", async () => {
    const { spy } = await mount(`/sales/${SALE}`);
    await waitFor(() => expect(screen.getAllByText("Rs 145,000").length).toBeGreaterThan(0), { timeout: 4000 });
    expect(screen.getAllByText("45,000").length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
