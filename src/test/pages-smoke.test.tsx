// Renders every owner screen against an in-memory fake of the database client,
// so a render-time crash on any screen fails the build. No network is used.
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n";
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
    { ...base, id: QA, name_en: "Awal", name_ur: "Awal", kind: "nakasi", category: "normal", is_active: true, sort_order: 1, stock_quality_id: null },
    { ...base, id: QS, name_en: "Awal", name_ur: "Awal", kind: "sale", category: "normal", is_active: true, sort_order: 2, stock_quality_id: QA },
  ],
  expense_categories: [{ ...base, id: "cat-1", name_en: "Diesel", name_ur: "Diesel", is_active: true, sort_order: 1 }],
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
  finished_stock: [{ quality_id: QA, name_en: "Awal", name_ur: "Awal", category: "normal", produced: 30000, sold: 10000, adjusted: 0, balance: 20000 }],
  raw_stock: [{ made: 48500, loaded: 40000, adjusted: 0, balance: 8500 }],
  stock_adjustments: [],
  cash_counts: [],
  audit_log: [{ id: 1, table_name: "transactions", row_id: "t1", action: "UPDATE", old_values: { amount: 1 }, new_values: { amount: 2 }, changed_by: U1, changed_at: base.created_at }],
};

const WRITES: { table: string; op: string; payload: unknown }[] = [];

/** Chainable stand-in for the PostgREST query builder: filters `eq` on known columns, ignores the rest. */
function builder(table: string) {
  let rows = [...(DB[table] ?? [])];
  let single = false;
  const b: Record<string, unknown> = {};
  const chain = (fn?: () => void) => () => { fn?.(); return b; };
  for (const m of ["select", "is", "in", "order", "gte", "lte", "not", "limit", "range", "upsert"]) b[m] = chain();
  b["insert"] = (payload: unknown) => { WRITES.push({ table, op: "insert", payload }); rows = []; return b; };
  b["update"] = (payload: unknown) => { WRITES.push({ table, op: "update", payload }); return b; };
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

const nav = { params: {} as Record<string, string>, search: new URLSearchParams(), pathname: "/" };
vi.mock("next/navigation", () => ({
  useParams: () => nav.params,
  useSearchParams: () => nav.search,
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

afterEach(cleanup);

/** Map a URL to the view that the app/ route renders, with its params. */
async function viewFor(path: string) {
  const [p, q] = path.split("?") as [string, string | undefined];
  nav.pathname = p;
  nav.search = new URLSearchParams(q ?? "");
  nav.params = {};
  const seg = p.split("/").filter(Boolean);
  const v = (m: Promise<{ default: () => ReactNode }>) => m.then((x) => x.default);
  if (seg[0] === "party" || (seg[0] === "patheer" && seg[1])) { nav.params = { id: seg[1]! }; return v(import("@/views/party")); }
  if (seg[0] === "people") { nav.params = { kind: seg[1]! }; return v(import("@/views/people")); }
  if (seg[0] === "sales" && seg[1] === "new") return v(import("@/views/new-sale"));
  if (seg[0] === "sales" && seg[1]) { nav.params = { id: seg[1] }; return v(import("@/views/invoice")); }
  if (seg[0] === "patheer") { const { PartyList } = await import("@/components/PartyList"); return () => <PartyList kind="patheer" />; }
  if (seg[0] === "rehra" || seg[0] === "nakasi") { const { KilnWeek } = await import("@/components/KilnWeek"); const st = seg[0]; return () => <KilnWeek stage={st} />; }
  const map: Record<string, string> = { dashboard: "dashboard", weekly: "weekly", sales: "sales", stock: "stock", expenses: "expenses", owners: "owners", reports: "reports", history: "history", seasons: "seasons", qualities: "qualities" };
  return v(import(`@/views/${map[seg[0]!]}.tsx`));
}

async function mount(path: string) {
  const View = await viewFor(path);
  const { default: AppShell } = await import("@/views/app-shell");
  const errors: unknown[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...a) => { errors.push(a); });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><I18nProvider><AppShell><View /></AppShell></I18nProvider></QueryClientProvider>);
  return { errors, spy };
}

const PAGES: [string, RegExp][] = [
  ["/dashboard", /This week/],
  ["/weekly", /Add entry for any date/],
  ["/patheer", /Akram/],
  ["/rehra", /Rehra khatta/],
  ["/nakasi", /Nakasi khatta/],
  ["/sales", /Bashir/],
  ["/sales/new", /Save invoice/],
  [`/sales/${SALE}`, /Invoice total/],
  ["/stock", /Finished stock/],
  ["/expenses", /Expense khatta/],
  ["/owners", /Between the brothers|Owners/],
  ["/reports", /Profit & loss/],
  ["/history", /Edit history/],
  ["/seasons", /2026-27/],
  ["/qualities", /Stock from/],
  ["/people/customer", /Bashir/],
  ["/people/employee", /Munshi/],
  [`/party/${P1}`, /Statement/],
  [`/party/${C1}`, /Statement/],
  [`/party/${E1}`, /Post month's salary/],
  [`/party/${N1}`, /Statement/],
];

describe("every page renders with data", () => {
  it.each(PAGES)("%s", async (path, expected) => {
    const { errors, spy } = await mount(path);
    await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), { timeout: 4000 });
    expect(screen.queryByText(/NEXT_NOT_FOUND/)).toBeNull();
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
    expect(screen.getAllByText("We owe him").length).toBeGreaterThan(0);
    spy.mockRestore();
  });
  it("customer: opening 1,000 + invoice 145,000 − paid 100,000 = he owes 46,000", async () => {
    const { spy } = await mount(`/party/${C1}`);
    await waitFor(() => expect(screen.getAllByText("46,000").length).toBeGreaterThan(0), { timeout: 4000 });
    expect(screen.getAllByText("He owes us").length).toBeGreaterThan(0);
    spy.mockRestore();
  });
  it("invoice page: 10,000 @ 14,500 = 145,000, received 100,000, due 45,000", async () => {
    const { spy } = await mount(`/sales/${SALE}`);
    await waitFor(() => expect(screen.getAllByText("Rs 145,000").length).toBeGreaterThan(0), { timeout: 4000 });
    expect(screen.getAllByText("45,000").length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});

describe("weekly register", () => {
  it("saves a count with only its date — the database assigns week and season", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
    try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
    WRITES.length = 0;
    const { spy } = await mount("/weekly");
    const cell = await screen.findByLabelText("Akram 2026-11-13 Estimated", {}, { timeout: 4000 });
    fireEvent.blur(cell, { target: { value: "2000" } });
    await waitFor(() => expect(WRITES.some((w) => w.table === "production_entries")).toBe(true), { timeout: 4000 });
    const w = WRITES.find((x) => x.table === "production_entries")!;
    expect(w.op).toBe("insert");
    expect(w.payload).toMatchObject({ party_id: P1, entry_date: "2026-11-13", estimated_count: 2000 });
    expect(w.payload).not.toHaveProperty("week_id");
    expect(w.payload).not.toHaveProperty("season_id");
    fireEvent.click(screen.getByText("Day"));
    expect(await screen.findByLabelText("Akram Estimated")).toBeInTheDocument();
    spy.mockRestore();
    vi.useRealTimers();
  });
});
