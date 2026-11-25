import { describe, expect, it } from "vitest";
import { amountFor, canSell, lineAmount, customerAccount, invoiceTotal, periodKey, stockRow, summarize } from "@/lib/kiln-math";

describe("sale amounts (Quantity / 1000 × Rate)", () => {
  it("5,000 Awal at Rs 18,000 per 1,000 = Rs 90,000", () => expect(amountFor(5000, 18000)).toBe(90000));
  it("odd quantities round half-up to whole rupees", () => {
    expect(amountFor(1250, 18000)).toBe(22500);
    expect(amountFor(333, 15500)).toBe(5162);
  });
});

describe("customer outstanding", () => {
  it("brief's example: 10,000 Awal @18,000 + 5,000 Doum @15,000 − paid 150,000 = 105,000", () => {
    const purchases = invoiceTotal([{ quantity: 10000, rate_per_1000: 18000 }]).total + invoiceTotal([{ quantity: 5000, rate_per_1000: 15000 }]).total;
    expect(purchases).toBe(255000);
    expect(customerAccount({ openingDue: 0, purchases, payments: 150000 })).toEqual({ outstanding: 105000, owes: 105000, advance: 0 });
  });
  it("opening balance is included", () => {
    expect(customerAccount({ openingDue: 20000, purchases: 180000, payments: 100000 }).outstanding).toBe(100000);
  });
  it("paying more than owed shows as advance, not an error", () => {
    expect(customerAccount({ openingDue: 0, purchases: 90000, payments: 100000 })).toEqual({ outstanding: -10000, owes: 0, advance: 10000 });
  });
});

describe("stock per brick type", () => {
  it("opening 50,000 + production 20,000 = 70,000 available; sell 10,000 → 60,000 remaining", () => {
    expect(stockRow({ opening: 50000, produced: 20000, sold: 10000 })).toEqual({ available: 70000, remaining: 60000, status: "ok" });
  });
  it("flags low, out and negative stock", () => {
    expect(stockRow({ opening: 9000, produced: 0, sold: 0 }).status).toBe("low");
    expect(stockRow({ opening: 1000, produced: 0, sold: 1000 }).status).toBe("out");
    expect(stockRow({ opening: 1000, produced: 0, sold: 1500 }).status).toBe("negative");
  });
  it("cannot sell more than remaining, counting earlier lines of the same sale", () => {
    expect(canSell(60000, 60000)).toBe(true);
    expect(canSell(60000, 60001)).toBe(false);
    expect(canSell(60000, 30000, 40000)).toBe(false);
    expect(canSell(60000, 0)).toBe(false);
  });
});

describe("report grouping", () => {
  it("day / week (Thursday) / month / year keys", () => {
    expect(periodKey("2026-11-25", "day")).toBe("2026-11-25");
    expect(periodKey("2026-11-25", "week")).toBe("2026-11-19");
    expect(periodKey("2026-11-25", "month")).toBe("2026-11");
    expect(periodKey("2026-11-25", "year")).toBe("2026");
  });
  it("sums bricks and rupees per group", () => {
    const rows = [
      { entry_date: "2026-11-24", quantity: 5000, amount: 90000 },
      { entry_date: "2026-11-25", quantity: 2000, amount: 30000 },
      { entry_date: "2026-12-01", quantity: 1000, amount: 18000 },
    ];
    expect(summarize(rows, (r) => periodKey(r.entry_date, "month"))).toEqual([
      { key: "2026-11", quantity: 7000, amount: 120000, count: 2 },
      { key: "2026-12", quantity: 1000, amount: 18000, count: 1 },
    ]);
  });
});

describe("roray (broken bricks) sold by the load", () => {
  it("2 trolleys at Rs 6,500 a load = Rs 13,000 (no ÷1000)", () => expect(lineAmount(2, 6500, "load")).toBe(13000));
  it("brick types still use rate per 1000", () => expect(lineAmount(1250, 18000, "thousand")).toBe(22500));
  it("an invoice mixing bricks and roray counts bricks and loads separately", () => {
    expect(invoiceTotal([{ quantity: 1000, rate_per_1000: 18000 }, { quantity: 3, rate_per_1000: 1500, unit: "load" }])).toEqual(
      { gross: 22500, discount: 0, delivery: 0, total: 22500, bricks: 1000, loads: 3 });
  });
});
