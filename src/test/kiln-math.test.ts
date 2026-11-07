import { describe, expect, it } from "vitest";
import { amountFor, earningsFor, generateWeeks, rateOn, settle, suggestedKharcha, weekStart, type Rate } from "@/lib/kiln-math";

const rates: Rate[] = [
  { kind: "earning", rate_per_1000: 1600, effective_from: "2026-01-01" },
  { kind: "kharcha", rate_per_1000: 1300, effective_from: "2026-01-01" },
];

describe("worked example: 1600 rate, 1300 kharcha, 50,000 est, 48,500 confirmed", () => {
  const entries = [{ entry_date: "2026-01-08", estimated_count: 50000, confirmed_count: 48500 }];
  it("earnings come from confirmed only = 77,600", () => {
    expect(earningsFor(entries, rates)).toBe(77600);
  });
  it("kharcha from estimated = 65,000", () => {
    expect(suggestedKharcha(entries, rates)).toBe(65000);
  });
  it("final balance: we owe him 12,600", () => {
    const s = settle({ opening: 0, earnings: 77600, kharcha: 65000, paidByUs: 0, paidByThem: 0, deductions: 0 });
    expect(s.balance).toBe(12600);
  });
  it("partial payment of 10,000 leaves 2,600", () => {
    const s = settle({ opening: 0, earnings: 77600, kharcha: 65000, paidByUs: 10000, paidByThem: 0, deductions: 0 });
    expect(s.balance).toBe(2600);
  });
});

describe("rules", () => {
  it("unconfirmed days earn nothing", () => {
    expect(earningsFor([{ entry_date: "2026-01-08", estimated_count: 9000, confirmed_count: null }], rates)).toBe(0);
  });
  it("rate change does not rewrite old dates", () => {
    const r: Rate[] = [...rates, { kind: "earning", rate_per_1000: 1800, effective_from: "2026-02-01" }];
    expect(rateOn(r, "earning", "2026-01-31")).toBe(1600);
    expect(rateOn(r, "earning", "2026-02-01")).toBe(1800);
  });
  it("rounds half-up to whole rupees", () => {
    expect(amountFor(1, 1500)).toBe(2); // 1.5 → 2
    expect(amountFor(1, 1400)).toBe(1);
  });
  it("rejects fractional counts", () => {
    expect(() => amountFor(1.5, 1600)).toThrow();
  });
  it("advance in opening balance makes him owe us", () => {
    expect(settle({ opening: -20000, earnings: 5000, kharcha: 0, paidByUs: 0, paidByThem: 0, deductions: 0 }).balance).toBe(-15000);
  });
  it("weeks run Thursday to Wednesday", () => {
    expect(weekStart("2026-11-04")).toBe("2026-10-29"); // Wed → previous Thu
    const w = generateWeeks("2026-11-05", "2026-11-20");
    expect(w[0]).toEqual({ week_number: 1, start_date: "2026-11-05", end_date: "2026-11-11" });
    expect(w).toHaveLength(3);
  });
});
