import { describe, expect, it } from "vitest";
import { objectsToRows, spreadsheetXml } from "@/lib/export";

describe("Excel export", () => {
  it("writes numbers as numbers and escapes text, keeping Urdu intact", () => {
    const xml = spreadsheetXml([{ name: "Sales", rows: [["نام", "Total"], ["A & <B>", 187000], [null, ""]] }]);
    expect(xml).toContain('<Worksheet ss:Name="Sales">');
    expect(xml).toContain('<Data ss:Type="String">نام</Data>');
    expect(xml).toContain('<Data ss:Type="Number">187000</Data>');
    expect(xml).toContain("A &amp; &lt;B&gt;");
    expect(xml).toContain("<Cell/>");
  });
  it("makes sheet names valid and unique", () => {
    const xml = spreadsheetXml([{ name: "a/b", rows: [] }, { name: "a/b", rows: [] }]);
    expect(xml).toContain('ss:Name="a b"');
    expect(xml).toContain('ss:Name="a b 2"');
  });
  it("objects become header + rows, with JSON for nested values", () => {
    expect(objectsToRows([{ a: 1, b: { x: 1 } }, { a: 2, c: null }])).toEqual([["a", "b", "c"], [1, '{"x":1}', null], [2, null, null]]);
  });
});
