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
    { ...base, id: QS, name_en: "Awal", name_ur: "Awal", kind: "sale", category: "normal", is_active: false, sort_order: 2, stock_quality_id: QA, unit: "thousand" },
    { ...base, id: "q-roray", name_en: "Trali Roray", name_ur: "Trali Roray", kind: "sale", category: "other", is_active: true, sort_order: 201, stock_quality_id: null, unit: "load" },
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
    { ...base, id: "k2", stage: "rehra", party_id: R1, season_id: S1, week_id: W1, entry_date: "2026-11-13", quality_id: null, source_party_id: P1, count: 40000, notes: null, raw_type: "brick", from_store: false },
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
  finished_stock: [{ quality_id: QA, name_en: "Awal", name_ur: "Awal", category: "normal", sort_order: 1, is_active: true, opening: 50000, produced: 30000, sold: 10000, adjusted: 0, balance: 70000 }],
  customer_accounts: [
    { party_id: C1, ref_no: 1, name: "Bashir", phone: "0300", address: null, notes: null, is_cash: false, is_active: true, opening_due: 1000, bricks: 10000, purchases: 145000, sales_count: 1, payments: 100000, adjustments: 0, outstanding: 46000, last_sale: "2026-11-14", is_favourite: true },
    { party_id: "cash-1", ref_no: 2, name: "Nakad Bikri", phone: null, address: null, notes: null, is_cash: true, is_active: true, opening_due: 0, bricks: 2000, purchases: 30000, sales_count: 1, payments: 30000, adjustments: 0, outstanding: 0, last_sale: "2026-11-14" },
  ],
  sale_lines: [{ item_id: "si1", sale_id: SALE, invoice_no: 1, entry_date: "2026-11-14", customer_id: C1, vehicle_no: "ABC-1", driver_name: "D", note: null, quality_id: QA, quantity: 10000, rate_per_1000: 14500, amount: 145000, season_id: S1 }],
  raw_stock: [{ made: 48500, loaded: 40000, adjusted: 0, balance: 8500, external: 0, stored: 0, drying: 8500 }],
  raw_store: [],
  gair_check: [
    { gair_key: "gair 7", gair: "Gair 7", first_date: "2026-11-13", last_date: "2026-11-20", loaded_bricks: 80000, loaded_9t: 8000, loaded_from_store: 20000, produced_bricks: 79000, produced_9t: 8000, diff_bricks: 1000, diff_9t: 0 },
    { gair_key: "", gair: "", first_date: "2026-11-13", last_date: "2026-11-13", loaded_bricks: 40000, loaded_9t: 0, loaded_from_store: 0, produced_bricks: 30000, produced_9t: 0, diff_bricks: 10000, diff_9t: 0 },
  ],
  raw_store_stock: [
    { raw_type: "brick", from_patheer: 0, outsourced: 20000, opening: 0, adjusted: 0, used: 5000, balance: 15000 },
    { raw_type: "9t", from_patheer: 0, outsourced: 0, opening: 0, adjusted: 0, used: 0, balance: 0 },
  ],
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
    rpc: async (fn: string, args: unknown) => { WRITES.push({ table: fn, op: "rpc", payload: args }); return { data: true, error: null }; },
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
  if (seg[0] === "sales" && seg[1] === "invoices") return v(import("@/views/sales"));
  if (seg[0] === "customers" && seg[1]) { nav.params = { id: seg[1] }; return v(import("@/views/customer")); }
  if (seg[0] === "stock" && seg[1] === "opening") return v(import("@/views/opening-stock"));
  if (seg[0] === "sales" && seg[1]) { nav.params = { id: seg[1] }; return v(import("@/views/invoice")); }
  if (seg[0] === "patheer") { const { PartyList } = await import("@/components/PartyList"); return () => <PartyList kind="patheer" />; }
  if (seg[0] === "rehra" || seg[0] === "nakasi") { const { KilnWeek } = await import("@/components/KilnWeek"); const st = seg[0]; return () => <KilnWeek stage={st} />; }
  const map: Record<string, string> = { dashboard: "dashboard", weekly: "weekly", sales: "sales-register", payments: "payments", customers: "customers", production: "production", "sales-reports": "sales-reports", stock: "stock", expenses: "expenses", owners: "owners", reports: "reports", history: "history", seasons: "seasons", qualities: "qualities", gair: "gair" };
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
  ["/dashboard", /Stock by brick type/],
  ["/payments", /Payments register/],
  ["/customers", /C-001/],
  [`/customers/${C1}`, /Purchase history/],
  ["/production", /Production register/],
  ["/stock/opening", /Opening quantity/],
  ["/sales-reports", /Sales by brick type/],
  ["/sales/invoices", /Bashir/],
  ["/weekly", /Add entry for any date/],
  ["/patheer", /Akram/],
  ["/rehra", /Rehra khatta/],
  ["/gair", /Gair check/],
  ["/nakasi", /Nakasi khatta/],
  ["/sales", /Bashir/],
  ["/sales/new", /Save invoice/],
  [`/sales/${SALE}`, /Invoice total/],
  ["/stock", /Stock summary/],
  ["/expenses", /Expense khatta/],
  ["/owners", /Between the brothers|Owners/],
  ["/reports", /Profit & loss/],
  ["/history", /Edit history/],
  ["/seasons", /2026-27/],
  ["/qualities", /Add brick type/],
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
    fireEvent.focus(cell);
    fireEvent.change(cell, { target: { value: "2000" } });
    fireEvent.blur(cell);
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

describe("expense khatta sheet", () => {
  it("typing in the blank row adds an expense; a new category name creates the category", async () => {
    WRITES.length = 0;
    const { spy } = await mount("/expenses");
    // The phone card and the desktop row both exist in the DOM (no CSS in tests); the desktop row is last.
    const desc = (await screen.findAllByPlaceholderText("New kharcha… e.g. diesel", {}, { timeout: 4000 })).at(-1)!;
    fireEvent.change(desc, { target: { value: "coal truck kiraya" } });
    fireEvent.change(screen.getAllByPlaceholderText("Category").at(-1)!, { target: { value: "Diesel" } });
    const amount = screen.getAllByPlaceholderText("0").at(-1)!;
    fireEvent.change(amount, { target: { value: "200000" } });
    await waitFor(() => expect(screen.getAllByText("Add").at(-1)).not.toBeDisabled());
    fireEvent.keyDown(amount, { key: "Enter" });
    await waitFor(() => expect(WRITES.some((w) => w.table === "transactions")).toBe(true), { timeout: 4000 });
    expect(WRITES.find((w) => w.table === "transactions")!.payload).toMatchObject({
      kind: "expense", direction: "out", amount: 200000, note: "coal truck kiraya", expense_category_id: "cat-1", handler_user_id: U1,
    });
    // Existing typed row shows in the sheet with its category; a brand-new category name is created on save.
    expect(screen.getAllByDisplayValue("diesel").length).toBeGreaterThan(0);
    WRITES.length = 0;
    fireEvent.change(screen.getAllByPlaceholderText("New kharcha… e.g. diesel").at(-1)!, { target: { value: "milk home" } });
    fireEvent.change(screen.getAllByPlaceholderText("Category").at(-1)!, { target: { value: "Home" } });
    fireEvent.change(screen.getAllByPlaceholderText("0").at(-1)!, { target: { value: "2000" } });
    fireEvent.keyDown(screen.getAllByPlaceholderText("0").at(-1)!, { key: "Enter" });
    await waitFor(() => expect(WRITES.some((w) => w.table === "expense_categories")).toBe(true), { timeout: 4000 });
    expect(WRITES.find((w) => w.table === "expense_categories")!.payload).toMatchObject({ name_en: "Home" });
    spy.mockRestore();
  });
});

describe("sales register", () => {
  it("warns (never blocks) when selling more than the stock, and saves a typed customer's sale", async () => {
    WRITES.length = 0;
    const { spy } = await mount("/sales");
    await screen.findAllByLabelText("Customer", {}, { timeout: 4000 });
    await waitFor(() => expect((screen.getAllByLabelText("Brick type").at(-1) as HTMLSelectElement).innerHTML).toContain("Awal (70,000)"), { timeout: 4000 });
    fireEvent.change(screen.getAllByLabelText("Customer").at(-1)!, { target: { value: "bashir" } });
    fireEvent.change(screen.getAllByLabelText("Brick type").at(-1)!, { target: { value: QA } });
    const qty = screen.getAllByLabelText("Quantity").at(-1)!;
    fireEvent.change(qty, { target: { value: "70001" } }); // stock is 70,000
    const add = screen.getAllByText("Add").at(-1)!;
    expect(qty).toHaveAttribute("title", expect.stringMatching(/more than in stock.*70,000/i));
    expect(add).not.toBeDisabled(); // rate left blank is fine too
    fireEvent.change(qty, { target: { value: "5000" } });
    fireEvent.change(screen.getAllByLabelText("Rate (/1000 or /load)").at(-1)!, { target: { value: "18000" } });
    expect(screen.getAllByText("90,000").length).toBeGreaterThan(0); // 5,000 × 18,000 / 1,000
    fireEvent.click(add);
    await waitFor(() => expect(WRITES.some((w) => w.table === "create_sale")).toBe(true), { timeout: 4000 });
    expect(WRITES.find((w) => w.table === "create_sale")!.payload).toMatchObject({ _customer_id: C1, _items: [{ quality_id: QA, quantity: 5000, rate_per_1000: 18000 }] });
    expect(WRITES.some((w) => w.table === "parties")).toBe(false); // existing customer, nothing added
    spy.mockRestore();
  });
  it("a new name typed as customer is added as a customer; favourites show as quick picks", async () => {
    WRITES.length = 0;
    const { spy } = await mount("/sales");
    await screen.findAllByLabelText("Customer", {}, { timeout: 4000 });
    expect(await screen.findByRole("button", { name: "Bashir" })).toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("Customer").at(-1)!, { target: { value: "Haji Aslam" } });
    expect(screen.getAllByLabelText("Customer").at(-1)!).toHaveAttribute("title", expect.stringMatching(/New customer/));
    await waitFor(() => expect((screen.getAllByLabelText("Brick type").at(-1) as HTMLSelectElement).innerHTML).toContain("Awal"), { timeout: 4000 });
    fireEvent.change(screen.getAllByLabelText("Brick type").at(-1)!, { target: { value: QA } });
    fireEvent.change(screen.getAllByLabelText("Quantity").at(-1)!, { target: { value: "1000" } });
    fireEvent.click(screen.getAllByText("Add").at(-1)!);
    await waitFor(() => expect(WRITES.some((w) => w.table === "parties" && w.op === "insert")).toBe(true), { timeout: 4000 });
    expect(WRITES.find((w) => w.table === "parties")!.payload).toMatchObject({ kind: "customer", name: "Haji Aslam" });
    spy.mockRestore();
  });
  it("Nakad Bikri asks how much was received, with a discount", async () => {
    WRITES.length = 0;
    const { spy } = await mount("/sales");
    await screen.findAllByLabelText("Customer", {}, { timeout: 4000 });
    await waitFor(() => expect((screen.getAllByLabelText("Brick type").at(-1) as HTMLSelectElement).innerHTML).toContain("Awal"), { timeout: 4000 });
    fireEvent.change(screen.getAllByLabelText("Customer").at(-1)!, { target: { value: "Nakad Bikri" } });
    fireEvent.change(screen.getAllByLabelText("Brick type").at(-1)!, { target: { value: QA } });
    fireEvent.change(screen.getAllByLabelText("Quantity").at(-1)!, { target: { value: "1000" } });
    fireEvent.change(screen.getAllByLabelText("Rate (/1000 or /load)").at(-1)!, { target: { value: "18000" } });
    fireEvent.click(screen.getAllByText("Add").at(-1)!);
    expect(await screen.findByText("This is the amount. Was it received?")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Discount"), { target: { value: "500" } });
    expect(screen.getByText(/Received in full — Rs 17,500/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Save sale"));
    await waitFor(() => expect(WRITES.some((w) => w.table === "create_sale")).toBe(true), { timeout: 4000 });
    expect(WRITES.find((w) => w.table === "create_sale")!.payload).toMatchObject({ _customer_id: "cash-1", _discount: 500, _paid: 17500 });
    spy.mockRestore();
  });
  it("roray are listed apart from brick types, priced per load, with no stock limit", async () => {
    const { spy } = await mount("/sales");
    const selects = await screen.findAllByLabelText("Customer", {}, { timeout: 4000 });
    await waitFor(() => expect((screen.getAllByLabelText("Brick type").at(-1) as HTMLSelectElement).innerHTML).toContain("Trali Roray"), { timeout: 4000 });
    const typeSel = screen.getAllByLabelText("Brick type").at(-1) as HTMLSelectElement;
    expect(typeSel.querySelector('optgroup[label="Roray — per load"]')?.textContent).toBe("Trali Roray");
    fireEvent.change(selects.at(-1)!, { target: { value: C1 } });
    fireEvent.change(typeSel, { target: { value: "q-roray" } });
    fireEvent.change(screen.getAllByLabelText("Quantity").at(-1)!, { target: { value: "3" } });
    fireEvent.change(screen.getAllByLabelText("Rate (/1000 or /load)").at(-1)!, { target: { value: "6500" } });
    expect(screen.getAllByText("19,500").length).toBeGreaterThan(0); // 3 loads × 6,500
    expect(screen.getAllByText("Add").at(-1)!).not.toBeDisabled();
    spy.mockRestore();
  });
});

describe("rehra khatta", () => {
  it("loads say bricks or 9t tile and where from (patheer or kacha store); outsource bricks go to the store", async () => {
    WRITES.length = 0;
    const { spy } = await mount("/rehra");
    expect(await screen.findByText("Kacha store — stored dry bricks", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(await screen.findByText("15,000")).toBeInTheDocument(); // bricks in store
    // Patheer is switched off for now: no "made − loaded" figure and no patheer names in "From".
    expect(screen.queryByText(/Made − loaded/)).toBeNull();
    const fromOpts = [...(screen.getAllByLabelText("From").at(-1) as HTMLSelectElement).options].map((o) => o.text);
    expect(fromOpts).toEqual(["Fresh kacha", "📦 Kacha store"]);
    // New load from the store
    fireEvent.change(screen.getAllByLabelText("Rehra").at(-1)!, { target: { value: R1 } });
    fireEvent.change(screen.getAllByLabelText("What").at(0)!.closest("table")!.querySelectorAll("tr.new select[aria-label='What']")[0]!, { target: { value: "9t" } });
    const from = screen.getAllByLabelText("From").at(-1)!;
    fireEvent.change(from, { target: { value: "store" } });
    const count = screen.getAllByLabelText("bricks").at(-1)!;
    fireEvent.change(count, { target: { value: "100" } });
    expect(count).toHaveAttribute("title", expect.stringMatching(/More than in the kacha store/)); // 0 9t tiles in store
    fireEvent.keyDown(count, { key: "Enter" });
    await waitFor(() => expect(WRITES.some((w) => w.table === "kiln_entries")).toBe(true), { timeout: 4000 });
    // Gair defaults to the latest gair, so loads are checked without typing it each time.
    expect(WRITES.find((w) => w.table === "kiln_entries")!.payload).toMatchObject({ stage: "rehra", raw_type: "9t", from_store: true, source_party_id: null, count: 100, firing_ref: "Gair 7" });
    // Outsource supplier stacks bricks in the store
    fireEvent.change(screen.getByLabelText("Supplier name"), { target: { value: "Haji Bhatta" } });
    const bricks = screen.getAllByLabelText("Bricks").at(-1)!;
    fireEvent.change(bricks, { target: { value: "20000" } });
    fireEvent.keyDown(bricks, { key: "Enter" });
    await waitFor(() => expect(WRITES.some((w) => w.table === "raw_store")).toBe(true), { timeout: 4000 });
    expect(WRITES.find((w) => w.table === "raw_store")!.payload).toMatchObject({ source: "outsource", supplier: "Haji Bhatta", raw_type: "brick", count: 20000 });
    spy.mockRestore();
  });
});

describe("gair check", () => {
  it("shows kacha in vs pakki out per gair, the loss, loads with no gair, and the unused store", async () => {
    const { spy } = await mount("/gair");
    expect(await screen.findByText("Gair 7", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getAllByText("80,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("79,000").length).toBeGreaterThan(0);
    expect(screen.getByText(/short 1\.3%/)).toBeInTheDocument();
    expect(screen.getAllByText(/Equal/).length).toBeGreaterThan(0); // 9t: 8,000 in, 8,000 out
    expect(screen.getByText(/Rehra loads with no gair/)).toBeInTheDocument();
    expect(screen.getByText("In kacha store (not in any gair yet)")).toBeInTheDocument();
    spy.mockRestore();
  });
});
