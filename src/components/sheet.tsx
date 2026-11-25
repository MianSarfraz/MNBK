"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const colName = (i: number) => (i < 26 ? LETTERS[i]! : LETTERS[Math.floor(i / 26) - 1]! + LETTERS[i % 26]!);

/** Scrollable spreadsheet frame. Arrow keys / Enter move between cells like Excel. */
export function Sheet({ children, className, minWidth }: { children: ReactNode; className?: string; minWidth?: number }) {
  return (
    <div className={cn("sheet-wrap", className)}>
      <table className="sheet" style={minWidth ? { minWidth } : undefined} onKeyDown={sheetKeyDown}>{children}</table>
    </div>
  );
}

/** The grey A B C … strip above the header, with an empty corner over the row numbers. */
export function LetterRow({ cols, rowNumbers = true }: { cols: number; rowNumbers?: boolean }) {
  return (
    <tr className="letters hidden md:table-row">
      {rowNumbers && <th className="rn" />}
      {Array.from({ length: cols }, (_, i) => <th key={i}>{colName(i)}</th>)}
    </tr>
  );
}

/**
 * Excel-style movement: Enter / ↓ next row, ↑ previous row, ← → at the edge of the text move across.
 * Date inputs and drop-downs keep their own arrow keys.
 */
export function sheetKeyDown(e: KeyboardEvent<HTMLTableElement>) {
  const el = e.target as HTMLElement;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) || !el.classList.contains("cell")) return;
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const td = el.closest("td");
  const tr = td?.parentElement as HTMLTableRowElement | null;
  if (!td || !tr) return;
  const ownArrows = el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "date");
  const text = el instanceof HTMLInputElement && !ownArrows ? el : null;
  const atStart = !text || (text.selectionStart === 0 && text.selectionEnd === 0);
  const atEnd = !text || text.selectionStart === text.value.length;

  const focusCell = (cell: Element | null | undefined) => {
    const target = cell?.querySelector<HTMLInputElement | HTMLSelectElement>(".cell:not(:disabled)");
    if (!target) return false;
    target.focus();
    if (target instanceof HTMLInputElement && target.type !== "date") target.select();
    return true;
  };
  const vertical = (dir: 1 | -1) => {
    let row: Element | null = dir === 1 ? tr.nextElementSibling : tr.previousElementSibling;
    while (row) {
      if (focusCell((row as HTMLTableRowElement).cells[td.cellIndex])) return true;
      row = dir === 1 ? row.nextElementSibling : row.previousElementSibling;
    }
    return false;
  };
  const horizontal = (dir: 1 | -1) => {
    const cells = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(".cell:not(:disabled)"));
    const next = cells[cells.indexOf(el) + dir];
    if (!next) return false;
    next.focus();
    if (next instanceof HTMLInputElement && next.type !== "date") next.select();
    return true;
  };

  let moved = false;
  if (e.key === "Enter") moved = vertical(e.shiftKey ? -1 : 1) || horizontal(1);
  else if (e.key === "ArrowDown" && !ownArrows) moved = vertical(1);
  else if (e.key === "ArrowUp" && !ownArrows) moved = vertical(-1);
  else if (e.key === "ArrowRight" && !ownArrows && atEnd) moved = horizontal(1);
  else if (e.key === "ArrowLeft" && !ownArrows && atStart) moved = horizontal(-1);
  if (moved || e.key === "Enter") e.preventDefault();
}

/** A spreadsheet cell editor: shows the value, selects it on focus, saves when you leave it. */
export function Cell({ value, onCommit, numeric, type = "text", list, placeholder, dim, className, disabled, label, bad }: {
  value: string; onCommit: (v: string) => void; numeric?: boolean; type?: string; list?: string; placeholder?: string;
  dim?: boolean; className?: string; disabled?: boolean; label?: string; bad?: boolean;
}) {
  // Numbers display like a sheet (12,000); commas are ignored when saving.
  const shown = numeric && /^-?\d+$/.test(value) ? Number(value).toLocaleString("en-PK") : value;
  const [v, setV] = useState(shown);
  useEffect(() => setV(shown), [shown]);
  return (
    <input className={cn("cell", numeric && "n num", dim && "dim", bad && "bad", className)} type={type} list={list} value={v}
      placeholder={placeholder} disabled={disabled} aria-label={label} inputMode={numeric ? "numeric" : undefined}
      onFocus={(e) => type !== "date" && e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== shown) onCommit(numeric ? v.replace(/,/g, "") : v); }} />
  );
}
