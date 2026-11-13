import { describe, expect, it } from "vitest";
import {
  amountAtRates, brothersSettlement, finishedStock, invoiceTotal, monthEnd, monthStart, normalizeDigits,
  ownerPosition, parseWhole, rawStock, seasonPnl, statement, txnEffect, type LedgerItem, type OwnerTxn, type Rate,
} from "@/lib/kiln-math";

const rates: Rate[] = [
  { kind: "earning", rate_per_1000: 1600, effective_from: "2026-01-01" },
  { kind: "kharcha", rate_per_1000: 1300, effective_from: "2026-01-01" },
];

describe("worked example through the universal ledger", () => {
  // 50,000 estimated, 48,500 confirmed, rate 1600, kharcha 1300
  const earnings = amountAtRates([{ date: "2026-01-08", count: 48500 }], rates, "earning");
  const kharcha = amountAtRates([{ date: "2026-01-08", count: 50000 }], rates, "kharcha");
  const items: LedgerItem[] = [
    { date: "2026-01-08", amount: earnings, label: "earnings", group: "w1" },
    { date: "2026-01-09", amount: txnEffect("kharcha", "out", kharcha), label: "kharcha" },
  ];
  it("earnings 77,600 and kharcha 65,000", () => {
    expect(earnings).toBe(77600);
    expect(kharcha).toBe(65000);
  });
  it("closing: we owe him 12,600", () => {
    const s = statement(0, items);
    expect(s.closing).toBe(12600);
    expect(s.credits).toBe(77600);
    expect(s.debits).toBe(65000);
    expect(s.rows.map((r) => r.running)).toEqual([77600, 12600]);
  });
  it("two partial payments settle him to zero", () => {
    const s = statement(0, [
      ...items,
      { date: "2026-03-01", amount: txnEffect("worker_payment_us", "out", 10000), label: "pay" },
      { date: "2026-03-05", amount: txnEffect("worker_payment_us", "out", 2600), label: "pay" },
    ]);
    expect(s.closing).toBe(0);
  });
  it("if he was over-advanced he pays us back", () => {
    const over = [...items, { date: "2026-01-10", amount: txnEffect("kharcha", "out", 20000), label: "kharcha" }];
    expect(statement(0, over).closing).toBe(-7400);
    const back = [...over, { date: "2026-03-01", amount: txnEffect("worker_payment_them", "in", 7400), label: "he pays" }];
    expect(statement(0, back).closing).toBe(0);
  });
});

describe("txnEffect sign rules", () => {
  it("payments out lower what we owe, payments in raise it", () => {
    expect(txnEffect("salary", "out", 500)).toBe(-500);
    expect(txnEffect("sale_receipt", "in", 500)).toBe(500);
  });
  it("adjustment in = deduction, out = credit", () => {
    expect(txnEffect("adjustment", "in", 300)).toBe(-300);
    expect(txnEffect("adjustment", "out", 300)).toBe(300);
  });
  it("expenses and owner transfers never touch a party balance", () => {
    expect(txnEffect("expense", "out", 999)).toBe(0);
    expect(txnEffect("owner_transfer", "out", 999)).toBe(0);
    expect(txnEffect("other", "in", 999)).toBe(0);
  });
  it("rejects fractional or zero amounts", () => {
    expect(() => txnEffect("kharcha", "out", 10.5)).toThrow();
    expect(() => txnEffect("kharcha", "out", 0)).toThrow();
  });
});

describe("period statements", () => {
  const items: LedgerItem[] = [
    { date: "2026-01-05", amount: 1000, label: "a", group: "w" },
    { date: "2026-01-06", amount: 2000, label: "a", group: "w", bricks: 5, pending: 1 },
    { date: "2026-02-01", amount: -500, label: "pay" },
    { date: "2026-03-01", amount: 4000, label: "b" },
  ];
  it("brought forward includes opening and earlier rows; closing stops at `to`", () => {
    const s = statement(100, items, "2026-02-01", "2026-02-28");
    expect(s.broughtForward).toBe(3100);
    expect(s.rows).toHaveLength(1);
    expect(s.closing).toBe(2600);
  });
  it("groups merge within the period", () => {
    const s = statement(0, items);
    expect(s.rows[0]).toMatchObject({ amount: 3000, bricks: 5, pending: 1, date: "2026-01-05", running: 3000 });
    expect(s.closing).toBe(6500);
  });
});

describe("customer invoice and balance", () => {
  it("lines rounded half-up each, minus discount, plus delivery", () => {
    // 10,000 Awal @ 14,500 = 145,000; 3,333 Doum @ 12,345 = 41,145.885 → 41,146
    const t = invoiceTotal([{ quantity: 10000, rate_per_1000: 14500 }, { quantity: 3333, rate_per_1000: 12345 }], 1146, 2000);
    expect(t).toEqual({ gross: 186146, discount: 1146, delivery: 2000, total: 187000, bricks: 13333 });
  });
  it("customer owes the invoice less what he paid", () => {
    const s = statement(0, [
      { date: "2026-02-01", amount: -187000, label: "invoice" },
      { date: "2026-02-01", amount: txnEffect("sale_receipt", "in", 100000), label: "paid now" },
      { date: "2026-02-20", amount: txnEffect("sale_receipt", "in", 50000), label: "later" },
    ]);
    expect(s.closing).toBe(-37000); // he owes us 37,000
  });
  it("discount larger than invoice is rejected", () => {
    expect(() => invoiceTotal([{ quantity: 1000, rate_per_1000: 1000 }], 2000)).toThrow();
  });
});

describe("employee salary ledger", () => {
  it("accrued salary − advance − salary paid − deduction", () => {
    const s = statement(0, [
      { date: "2026-01-01", amount: 30000, label: "Jan salary" },
      { date: "2026-01-10", amount: txnEffect("kharcha", "out", 5000), label: "advance" },
      { date: "2026-01-31", amount: txnEffect("salary", "out", 24000), label: "salary" },
      { date: "2026-01-31", amount: txnEffect("adjustment", "in", 1000), label: "absence" },
    ]);
    expect(s.closing).toBe(0);
  });
});

describe("stock", () => {
  it("finished = nakasi output − mapped sales + adjustments", () => {
    const m = finishedStock(
      [{ quality_id: "awal", count: 100000 }, { quality_id: "doum", count: 20000 }, { quality_id: "awal", count: 5000 }],
      [{ stock_quality_id: "awal", quantity: 60000 }, { stock_quality_id: null, quantity: 999 }],
      [{ quality_id: "awal", delta: -500 }, { quality_id: null, delta: -7 }],
    );
    expect(m.get("awal")).toEqual({ produced: 105000, sold: 60000, adjusted: -500, balance: 44500 });
    expect(m.get("doum")?.balance).toBe(20000);
  });
  it("raw = confirmed made − loaded + adjustments", () => {
    expect(rawStock(48500, 40000, -200)).toEqual({ made: 48500, loaded: 40000, adjusted: -200, balance: 8300 });
  });
});

describe("season P&L", () => {
  it("kharcha is an advance, so only earnings count as worker cost", () => {
    const p = seasonPnl({ sales: 1_000_000, otherIncome: 5000, workerCost: 400_000, salaries: 90_000, expenses: 300_000 });
    expect(p.profit).toBe(215_000);
  });
});

describe("owners", () => {
  const A = "a", B = "b";
  const tx: OwnerTxn[] = [
    { kind: "sale_receipt", direction: "in", amount: 100000, method: "cash", handler_user_id: A },
    { kind: "sale_receipt", direction: "in", amount: 20000, method: "bank", handler_user_id: A },
    { kind: "expense", direction: "out", amount: 40000, method: "cash", handler_user_id: B },
    { kind: "kharcha", direction: "out", amount: 10000, method: "cash", handler_user_id: A },
    { kind: "adjustment", direction: "in", amount: 777, method: "cash", handler_user_id: A },
    { kind: "owner_transfer", direction: "out", amount: 30000, method: "cash", handler_user_id: A, to_user_id: B },
  ];
  it("positions exclude adjustments and count transfers", () => {
    expect(ownerPosition(tx, A)).toEqual({ received: 120000, paid: 10000, transfersIn: 0, transfersOut: 30000, net: 80000, cashInHand: 60000 });
    expect(ownerPosition(tx, B)).toEqual({ received: 0, paid: 40000, transfersIn: 30000, transfersOut: 0, net: -10000, cashInHand: -10000 });
  });
  it("50/50 settlement levels both nets", () => {
    expect(brothersSettlement(80000, -10000)).toEqual({ from: "A", amount: 45000 });
    expect(brothersSettlement(0, 3)).toEqual({ from: "B", amount: 2 });
    expect(brothersSettlement(5, 5)).toEqual({ from: null, amount: 0 });
  });
});

describe("input helpers", () => {
  it("Urdu digits are accepted", () => {
    expect(normalizeDigits("۴۸,۵۰۰")).toBe("48500");
    expect(parseWhole("٥٠٠٠")).toBe(5000);
    expect(parseWhole("-1,200", true)).toBe(-1200);
    expect(parseWhole("-1,200")).toBe(1200);
    expect(parseWhole("")).toBeNull();
  });
  it("month bounds", () => {
    expect(monthStart("2026-02-17")).toBe("2026-02-01");
    expect(monthEnd("2028-02-03")).toBe("2028-02-29");
  });
});
