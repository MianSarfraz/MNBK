// Client-side exports with no extra dependencies.
// Excel: SpreadsheetML 2003 workbook (.xls) — opens in Excel / LibreOffice / Google Sheets, multiple sheets, Urdu text intact.

export type Cell = string | number | boolean | null | undefined;
export type Sheet = { name: string; rows: Cell[][] };

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // strip control characters that are invalid in XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** Build SpreadsheetML XML. Exported for tests. */
export function spreadsheetXml(sheets: Sheet[]): string {
  const used = new Set<string>();
  const sheetName = (n: string) => {
    const base = n.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet";
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base.slice(0, 28)} ${i}`;
    used.add(name);
    return name;
  };
  const cell = (v: Cell) => {
    if (v == null || v === "") return "<Cell/>";
    if (typeof v === "number" && Number.isFinite(v)) return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
    return `<Cell><Data ss:Type="String">${xmlEscape(String(v))}</Data></Cell>`;
  };
  const body = sheets
    .map((s) => `<Worksheet ss:Name="${xmlEscape(sheetName(s.name))}"><Table>${s.rows.map((r) => `<Row>${r.map(cell).join("")}</Row>`).join("")}</Table></Worksheet>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${body}</Workbook>`;
}

export function downloadExcel(filename: string, sheets: Sheet[]) {
  download(filename.endsWith(".xls") ? filename : `${filename}.xls`, new Blob([spreadsheetXml(sheets)], { type: "application/vnd.ms-excel" }));
}

/** Rows of objects → header row + value rows. */
export function objectsToRows(objs: Record<string, unknown>[]): Cell[][] {
  if (!objs.length) return [["(empty)"]];
  const keys = Array.from(objs.reduce((set, o) => { Object.keys(o).forEach((k) => set.add(k)); return set; }, new Set<string>()));
  return [keys, ...objs.map((o) => keys.map((k) => {
    const v = o[k];
    if (v == null) return null;
    if (typeof v === "object") return JSON.stringify(v);
    return v as Cell;
  }))];
}

export function downloadJson(filename: string, data: unknown) {
  download(filename, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
}
