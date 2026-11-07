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
  const [y, m, d] = s.split("-").map(Number);
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
