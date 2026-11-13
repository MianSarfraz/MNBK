// Pure integer math for the kiln khattas. Bricks = whole numbers, money = whole rupees.
// Never use floats for stored amounts; every division is integer with half-up rounding.

export type Rate = { rate_per_1000: number; effective_from: string; kind: "earning" | "kharcha" };

/** amount = count × ratePer1000 / 1000, rounded half-up to whole rupees. */
export function amountFor(count: number, ratePer1000: number): number {
  if (!Number.isInteger(count) || !Number.isInteger(ratePer1000)) {
    throw new Error("count and rate must be integers");
  }
  if (count < 0 || ratePer1000 < 0) throw new Error("negative values not allowed");
  return Math.floor((count * ratePer1000 + 500) / 1000);
}

/** The rate in force on a date (latest effective_from <= date), or null. */
export function rateOn(rates: Rate[], kind: Rate["kind"], date: string): number | null {
  let best: Rate | null = null;
  for (const r of rates) {
    if (r.kind !== kind || r.effective_from > date) continue;
    if (!best || r.effective_from > best.effective_from) best = r;
  }
  return best ? best.rate_per_1000 : null;
}

export type DayEntry = { entry_date: string; estimated_count: number; confirmed_count: number | null };

/** Earnings use CONFIRMED counts only, each entry at the rate effective on its date. */
export function earningsFor(entries: DayEntry[], rates: Rate[]): number {
  let total = 0;
  for (const e of entries) {
    if (e.confirmed_count == null) continue;
    const r = rateOn(rates, "earning", e.entry_date);
    if (r == null) continue;
    total += amountFor(e.confirmed_count, r);
  }
  return total;
}

/** Suggested weekly kharcha from ESTIMATED counts at the kharcha rate. */
export function suggestedKharcha(entries: DayEntry[], rates: Rate[]): number {
  let total = 0;
  for (const e of entries) {
    const r = rateOn(rates, "kharcha", e.entry_date);
    if (r == null) continue;
    total += amountFor(e.estimated_count, r);
  }
  return total;
}

export type Settlement = {
  opening: number;
  earnings: number;
  kharcha: number;
  paidByUs: number;
  paidByThem: number;
  deductions: number;
  balance: number; // > 0 we owe him; < 0 he owes us
};

/** balance = opening + earnings − kharcha − paidByUs + paidByThem − deductions */
export function settle(p: Omit<Settlement, "balance">): Settlement {
  const balance = p.opening + p.earnings - p.kharcha - p.paidByUs + p.paidByThem - p.deductions;
  return { ...p, balance };
}

// ---------- Weeks (Thursday → Wednesday) ----------
function toDate(s: string) {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}
export function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
export function addDays(s: string, n: number) {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
/** The Thursday on or before the given date. */
export function weekStart(s: string) {
  const dow = toDate(s).getUTCDay(); // 0 Sun … 4 Thu
  return addDays(s, -((dow - 4 + 7) % 7));
}
export function generateWeeks(start: string, end: string) {
  const out: { week_number: number; start_date: string; end_date: string }[] = [];
  let s = weekStart(start);
  let n = 1;
  while (s <= end) {
    out.push({ week_number: n++, start_date: s, end_date: addDays(s, 6) });
    s = addDays(s, 7);
  }
  return out;
}
export function weekDays(start: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Total amount for many counts at the rate effective on each date (per-entry half-up rounding). */
export function amountAtRates(items: { date: string; count: number }[], rates: Rate[], kind: Rate["kind"]): number {
  let total = 0;
  for (const it of items) {
    const r = rateOn(rates, kind, it.date);
    if (r == null) continue;
    total += amountFor(it.count, r);
  }
  return total;
}

// ---------- Universal party ledger ----------
// Sign convention everywhere: balance > 0 → we owe the party; balance < 0 → the party owes us.

export type TxnKind =
  | "kharcha" | "expense" | "salary" | "worker_payment_us" | "worker_payment_them"
  | "sale_receipt" | "adjustment" | "owner_transfer" | "other";
export type Direction = "in" | "out";

/** Kinds that settle money between us and a party. */
const PAYMENT_KINDS: TxnKind[] = ["kharcha", "salary", "worker_payment_us", "worker_payment_them", "sale_receipt"];

/**
 * Effect of one transaction on a party's balance.
 * Payments: money out to the party lowers what we owe; money in from the party raises it.
 * Adjustments (no cash moves): "in" = deduction from the party, "out" = credit to the party.
 * Expenses / other / owner transfers do not change a party balance.
 * Mirrors the SQL view public.party_ledger.
 */
export function txnEffect(kind: TxnKind, direction: Direction, amount: number): number {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer");
  if (kind === "adjustment") return direction === "in" ? -amount : amount;
  if (PAYMENT_KINDS.includes(kind)) return direction === "out" ? -amount : amount;
  return 0;
}

/** Cash moves only for real payments; adjustments are book entries. */
export function isCashMovement(kind: TxnKind) {
  return kind !== "adjustment";
}

export type LedgerItem = {
  date: string;
  /** Signed effect on the balance (+ we owe more, − we owe less). */
  amount: number;
  label: string;
  /** Items in the same group (e.g. one week's earnings) merge into one row. */
  group?: string;
  /** Free tag for summaries (e.g. "work", "kharcha", "invoice"). */
  tag?: string;
  ref?: string;
  note?: string | null;
  bricks?: number;
  pending?: number;
};
export type LedgerRow = Required<Pick<LedgerItem, "date" | "amount" | "label">> & Omit<LedgerItem, "date" | "amount" | "label"> & { running: number };
export type Statement = {
  broughtForward: number;
  rows: LedgerRow[];
  credits: number;
  debits: number;
  closing: number;
};

/**
 * Statement for a period [from, to] (inclusive, ISO dates; either may be omitted).
 * Brought forward = opening + everything before `from`. Closing = brought forward + period rows.
 */
export function statement(opening: number, items: LedgerItem[], from?: string, to?: string): Statement {
  let bf = opening;
  const inRange: LedgerItem[] = [];
  for (const it of items) {
    if (!Number.isInteger(it.amount)) throw new Error("ledger amounts must be integers");
    if (from && it.date < from) bf += it.amount;
    else if (!to || it.date <= to) inRange.push(it);
  }
  const merged: LedgerItem[] = [];
  const byGroup = new Map<string, LedgerItem>();
  for (const it of inRange) {
    if (it.group) {
      const g = byGroup.get(it.group);
      if (g) {
        g.amount += it.amount;
        g.bricks = (g.bricks ?? 0) + (it.bricks ?? 0);
        g.pending = (g.pending ?? 0) + (it.pending ?? 0);
        if (it.date < g.date) g.date = it.date;
        continue;
      }
      const copy = { ...it };
      byGroup.set(it.group, copy);
      merged.push(copy);
    } else merged.push({ ...it });
  }
  // Stable sort by date keeps the caller's order (earnings before payments) within a day.
  const sorted = merged.map((m, i) => ({ m, i })).sort((a, b) => a.m.date.localeCompare(b.m.date) || a.i - b.i).map((x) => x.m);
  let run = bf;
  let credits = 0;
  let debits = 0;
  const rows = sorted.map((r) => {
    run += r.amount;
    if (r.amount >= 0) credits += r.amount;
    else debits -= r.amount;
    return { ...r, running: run } as LedgerRow;
  });
  return { broughtForward: bf, rows, credits, debits, closing: run };
}

// ---------- Sales invoices ----------
export type SaleLine = { quantity: number; rate_per_1000: number };
export type InvoiceTotal = { gross: number; discount: number; delivery: number; total: number; bricks: number };

/** total = Σ(line amounts, each rounded half-up) − discount + delivery. Mirrors SQL view public.sale_totals. */
export function invoiceTotal(lines: SaleLine[], discount = 0, delivery = 0): InvoiceTotal {
  if (!Number.isInteger(discount) || !Number.isInteger(delivery) || discount < 0 || delivery < 0) {
    throw new Error("discount and delivery must be whole, non-negative rupees");
  }
  let gross = 0;
  let bricks = 0;
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) throw new Error("quantity must be a positive whole number");
    gross += amountFor(l.quantity, l.rate_per_1000);
    bricks += l.quantity;
  }
  const total = gross - discount + delivery;
  if (total < 0) throw new Error("discount is larger than the invoice");
  return { gross, discount, delivery, total, bricks };
}

// ---------- Stock ----------
/** Finished stock per stock-quality: nakasi output − sales (mapped to stock quality) + adjustments. */
export function finishedStock(
  produced: { quality_id: string; count: number }[],
  sold: { stock_quality_id: string | null; quantity: number }[],
  adjustments: { quality_id: string | null; delta: number }[],
) {
  const m = new Map<string, { produced: number; sold: number; adjusted: number; balance: number }>();
  const get = (q: string) => {
    let r = m.get(q);
    if (!r) m.set(q, (r = { produced: 0, sold: 0, adjusted: 0, balance: 0 }));
    return r;
  };
  for (const p of produced) get(p.quality_id).produced += p.count;
  for (const s of sold) if (s.stock_quality_id) get(s.stock_quality_id).sold += s.quantity;
  for (const a of adjustments) if (a.quality_id) get(a.quality_id).adjusted += a.delta;
  for (const r of m.values()) r.balance = r.produced - r.sold + r.adjusted;
  return m;
}

/** Raw (unbaked) stock at the yard: patheer confirmed − loaded into the kiln by rehra + adjustments. */
export function rawStock(confirmedMade: number, loaded: number, adjusted = 0) {
  return { made: confirmedMade, loaded, adjusted, balance: confirmedMade - loaded + adjusted };
}

// ---------- Season profit & loss (accrual) ----------
export type Pnl = {
  sales: number; otherIncome: number; workerCost: number; salaries: number; expenses: number; profit: number;
};
/** profit = sales + other income − (patheer/rehra/nakasi earnings + salaries + expenses). Kharcha is an advance, not a cost. */
export function seasonPnl(p: Omit<Pnl, "profit">): Pnl {
  return { ...p, profit: p.sales + p.otherIncome - p.workerCost - p.salaries - p.expenses };
}

// ---------- Owners (the two brothers) ----------
export type OwnerTxn = {
  kind: TxnKind; direction: Direction; amount: number; method: string;
  handler_user_id: string; to_user_id?: string | null;
};
export type OwnerPosition = {
  received: number; paid: number; transfersIn: number; transfersOut: number; net: number; cashInHand: number;
};

/** Each owner's money position. Adjustments are excluded (no money moved). */
export function ownerPosition(txns: OwnerTxn[], ownerId: string): OwnerPosition {
  const p = { received: 0, paid: 0, transfersIn: 0, transfersOut: 0, net: 0, cashInHand: 0 };
  for (const x of txns) {
    if (!isCashMovement(x.kind)) continue;
    const cash = x.method === "cash";
    if (x.kind === "owner_transfer") {
      if (x.handler_user_id === ownerId) { p.transfersOut += x.amount; if (cash) p.cashInHand -= x.amount; }
      if (x.to_user_id === ownerId) { p.transfersIn += x.amount; if (cash) p.cashInHand += x.amount; }
      continue;
    }
    if (x.handler_user_id !== ownerId) continue;
    if (x.direction === "in") { p.received += x.amount; if (cash) p.cashInHand += x.amount; }
    else { p.paid += x.amount; if (cash) p.cashInHand -= x.amount; }
  }
  p.net = p.received - p.paid + p.transfersIn - p.transfersOut;
  return p;
}

/**
 * Equal (50/50) partners: the owner holding more net business money gives the other half the difference
 * so both end level. Odd rupee rounds half-up.
 */
export function brothersSettlement(netA: number, netB: number): { from: "A" | "B" | null; amount: number } {
  const diff = netA - netB;
  if (diff === 0) return { from: null, amount: 0 };
  const amount = Math.floor((Math.abs(diff) + 1) / 2);
  return { from: diff > 0 ? "A" : "B", amount };
}

// ---------- Input helpers ----------
/** Accept Urdu/Arabic-Indic digits from phone keyboards; keep only 0-9 (and an optional leading minus). */
export function normalizeDigits(raw: string, allowNegative = false): string {
  const ascii = raw.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  const neg = allowNegative && ascii.trim().startsWith("-");
  const digits = ascii.replace(/\D/g, "");
  return neg ? `-${digits}` : digits;
}
/** Parse a whole number; returns null for blank / invalid. */
export function parseWhole(raw: string, allowNegative = false): number | null {
  const s = normalizeDigits(raw, allowNegative);
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}
/** First day of the month for an ISO date. */
export function monthStart(s: string) {
  return `${s.slice(0, 7)}-01`;
}
/** Last day of the month for an ISO date. */
export function monthEnd(s: string) {
  const [y, m] = s.split("-").map(Number) as [number, number];
  return iso(new Date(Date.UTC(y, m, 0)));
}
