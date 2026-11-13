"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, fmtMonth, useT } from "@/lib/i18n";
import { addDays, monthEnd, monthStart, parseWhole } from "@/lib/kiln-math";
import { errMsg, fetchAll, myId, openReceipt, today, uploadReceipt, useExpenseCategories, useOwners, useParties } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import { txnKindLabel } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DateInput, Empty, Field, MethodSelect, NumInput, OwnerSelect, PageHeader, PrintHeader, Section, Stat, type Method } from "@/components/kit";

type Txn = Tables<"transactions">;
type Cat = Tables<"expense_categories">;
type Tab = "out" | "in" | "summary";

/** Rows typed straight into the khatta (not created from a ledger, register or invoice). */
const isFree = (x: Pick<Txn, "kind" | "party_id">) => (x.kind === "expense" || x.kind === "other") && !x.party_id;
const sortRows = (a: Txn, b: Txn) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at);

export default function ExpensesPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const owners = useOwners();
  const cats = useExpenseCategories();
  const parties = useParties();
  const [tab, setTab] = useState<Tab>("out");
  const [month, setMonth] = useState(monthStart(today()));
  const [allTime, setAllTime] = useState(false);
  const from = allTime ? "1900-01-01" : month;
  const to = allTime ? "2999-12-31" : monthEnd(month);
  const [me, setMe] = useState("");
  useEffect(() => { myId().then(setMe).catch(() => {}); }, []);

  const txQ = useQuery({
    queryKey: ["transactions", from, to],
    queryFn: () => fetchAll<Txn>((a, b) => supabase.from("transactions").select("*").is("deleted_at", null)
      .gte("entry_date", from).lte("entry_date", to).order("entry_date").order("created_at").range(a, b)),
  });
  const all = useMemo(() => (txQ.data ?? []).slice().sort(sortRows), [txQ.data]);
  const outRows = all.filter((x) => x.direction === "out" && x.kind !== "owner_transfer" && x.kind !== "adjustment");
  const inRows = all.filter((x) => x.direction === "in" && x.kind !== "adjustment");
  const totalOut = outRows.reduce((s, x) => s + Number(x.amount), 0);
  const totalIn = inRows.reduce((s, x) => s + Number(x.amount), 0);

  const ownerName = (id: string | null | undefined) => (owners.data ?? []).find((o) => o.id === id)?.display_name ?? "—";
  const partyName = (id: string | null) => (parties.data ?? []).find((p) => p.id === id)?.name;
  const catName = (id: string | null) => (cats.data ?? []).find((c) => c.id === id)?.name_en ?? "";
  const refresh = () => qc.invalidateQueries();

  function exportXls() {
    const sheet = (rows: Txn[]) => [
      ["#", "Date", "Description", "Category", "Amount", "By", "Method"],
      ...rows.map((x, i) => [i + 1, x.entry_date, describe(x), categoryOf(x), Number(x.amount), ownerName(x.handler_user_id), x.method]),
      [], ["", "", "", "Total", rows.reduce((s, x) => s + Number(x.amount), 0)],
    ];
    downloadExcel(`khatta-${allTime ? "all" : month.slice(0, 7)}`, [{ name: "Kharcha", rows: sheet(outRows) }, { name: "Receiving", rows: sheet(inRows) }]);
  }
  const describe = (x: Txn) => [partyName(x.party_id), x.note].filter(Boolean).join(" — ") || t(txnKindLabel(x));
  const categoryOf = (x: Txn) => (isFree(x) ? catName(x.expense_category_id) : t(txnKindLabel(x)));

  return (
    <div className="space-y-3">
      <PrintHeader title={t("expenseKhatta")} sub={allTime ? t("allTime") : fmtMonth(month)} />
      <PageHeader title={t("expenseKhatta")} sub={t("sheetHelp")}
        actions={<><Button variant="outline" size="sm" onClick={exportXls}>Excel</Button><Button variant="outline" size="sm" onClick={() => window.print()}>{t("print")}</Button></>} />

      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border bg-card">
          <button className="h-9 px-3 text-lg disabled:opacity-40" disabled={allTime} onClick={() => setMonth(monthStart(addDays(month, -1)))} aria-label="previous month">‹</button>
          <span className="min-w-24 text-center text-sm font-semibold">{allTime ? t("allTime") : fmtMonth(month)}</span>
          <button className="h-9 px-3 text-lg disabled:opacity-40" disabled={allTime} onClick={() => setMonth(monthStart(addDays(monthEnd(month), 1)))} aria-label="next month">›</button>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={allTime} onCheckedChange={setAllTime} />{t("allTime")}</label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("kharchaOut")} value={totalOut} money tone="bad" />
        <Stat label={t("receivingIn")} value={totalIn} money tone="good" />
        <Stat label={t("net")} value={totalIn - totalOut} money />
      </div>

      {/* Sheet tabs, like the bottom of a Google Sheet */}
      <div className="no-print flex gap-1 border-b">
        {([["out", "kharchaTab"], ["in", "receivingTab"], ["summary", "summaryTab"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-semibold ${tab === k ? "border-b-card bg-card text-primary" : "border-transparent text-muted-foreground"}`}>
            {t(label)} <span className="num text-xs font-normal">({fmt(k === "out" ? outRows.length : k === "in" ? inRows.length : all.length)})</span>
          </button>
        ))}
      </div>

      {tab !== "summary" ? (
        <Sheet key={tab} direction={tab} rows={tab === "out" ? outRows : inRows} cats={cats.data ?? []} me={me}
          describe={describe} categoryOf={categoryOf} ownerName={ownerName} partyName={partyName} onChange={refresh} loading={txQ.isLoading} />
      ) : (
        <Summary outRows={outRows} inRows={inRows} all={all} categoryOf={categoryOf} ownerName={ownerName} onChange={refresh} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Sheet

function Sheet({ direction, rows, cats, me, describe, categoryOf, ownerName, partyName, onChange, loading }: {
  direction: "out" | "in"; rows: Txn[]; cats: Cat[]; me: string;
  describe: (x: Txn) => string; categoryOf: (x: Txn) => string; ownerName: (id: string | null | undefined) => string;
  partyName: (id: string | null) => string | undefined; onChange: () => void; loading: boolean;
}) {
  const { t } = useT();
  const total = rows.reduce((s, x) => s + Number(x.amount), 0);
  const listId = `cats-${direction}`;

  /** Resolve a typed category name to an id, creating the category when it is new. */
  async function categoryId(name: string): Promise<string | null> {
    const n = name.trim();
    if (!n) return null;
    const hit = cats.find((c) => c.name_en.toLowerCase() === n.toLowerCase());
    if (hit) return hit.id;
    const { data, error } = await supabase.from("expense_categories").insert({ name_en: n, name_ur: n, sort_order: 100, created_by: await myId() }).select("id").single();
    if (error) throw error;
    return data.id;
  }
  async function update(id: string, patch: Partial<Txn>) {
    const { error } = await supabase.from("transactions").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return false; }
    onChange();
    return true;
  }

  return (
    <div className="space-y-2">
    <MobileNewRow direction={direction} lastDate={rows.at(-1)?.entry_date} listId={listId} me={me} categoryId={categoryId} onSaved={onChange} />
    <div className="overflow-x-auto rounded-xl border bg-card">
      <datalist id={listId}>{cats.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.name_en} />)}</datalist>
      <table className="w-full border-collapse text-sm sm:min-w-[640px]">
        <thead>
          <tr className="bg-primary text-primary-foreground">
            <th className="hidden w-10 border-e border-primary-foreground/20 px-1 py-2 text-center sm:table-cell">#</th>
            <th className="w-[5.5rem] border-e border-primary-foreground/20 px-2 py-2 text-start sm:w-32">{t("date")}</th>
            <th className="border-e border-primary-foreground/20 px-2 py-2 text-start">{t("description")}</th>
            <th className="hidden w-40 border-e border-primary-foreground/20 px-2 py-2 text-start sm:table-cell">{t("category")}</th>
            <th className="w-24 border-e border-primary-foreground/20 px-2 py-2 text-end sm:w-28">{t("amountRs")}</th>
            <th className="hidden w-28 px-2 py-2 text-start sm:table-cell">{t("by")}</th>
            <th className="no-print hidden w-16 sm:table-cell" />
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">…</td></tr>}
          {rows.map((x, i) => {
            const firstOfDay = i === 0 || rows[i - 1]!.entry_date !== x.entry_date;
            const free = isFree(x);
            return (
              <tr key={x.id} className={`border-t ${firstOfDay && i > 0 ? "border-t-2 border-t-border" : ""} ${i % 2 ? "bg-muted/30" : ""}`}>
                <td className="num hidden border-e px-1 text-center text-xs text-muted-foreground sm:table-cell">{i + 1}</td>
                <td className="border-e p-0">
                  {free ? (
                    <CellInput type="date" className="px-1 text-xs sm:px-2 sm:text-sm" value={x.entry_date} dim={!firstOfDay} onCommit={(v) => v && v !== x.entry_date && update(x.id, { entry_date: v })} />
                  ) : <span className={`num block px-2 ${firstOfDay ? "" : "text-muted-foreground/50"}`}>{fmtDate(x.entry_date)}</span>}
                </td>
                <td className="border-e p-0">
                  {free ? (
                    <>
                      <CellInput value={x.note ?? ""} placeholder="—" onCommit={(v) => v !== (x.note ?? "") && update(x.id, { note: v.trim() || null })} />
                      <div className="sm:hidden">
                        <CellInput value={categoryOf(x)} list={listId} placeholder={t("category")} className="h-6 text-xs text-muted-foreground"
                          onCommit={async (v) => { if (v.trim() === categoryOf(x)) return; try { await update(x.id, { expense_category_id: await categoryId(v) }); } catch (e) { toast.error(errMsg(e)); } }} />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-1.5">
                      {x.party_id ? <Link href={`/party/${x.party_id}`} className="text-primary hover:underline">{partyName(x.party_id)}</Link> : null}
                      {x.sale_id ? <Link href={`/sales/${x.sale_id}`} className="text-xs text-muted-foreground underline">{t("invoice")}</Link> : null}
                      <span className="truncate text-muted-foreground">{x.note ? `— ${x.note}` : ""}</span>
                      <span className="text-[11px] text-muted-foreground sm:hidden">({categoryOf(x)})</span>
                    </div>
                  )}
                </td>
                <td className="hidden border-e p-0 sm:table-cell">
                  {free ? (
                    <CellInput value={categoryOf(x)} list={listId} placeholder="—"
                      onCommit={async (v) => { if (v.trim() === categoryOf(x)) return; try { await update(x.id, { expense_category_id: await categoryId(v) }); } catch (e) { toast.error(errMsg(e)); } }} />
                  ) : <span className="block px-2 text-xs text-muted-foreground">{categoryOf(x)}</span>}
                </td>
                <td className="border-e p-0">
                  {free ? (
                    <CellInput value={String(Number(x.amount))} numeric className="text-end font-semibold"
                      onCommit={(v) => { const n = parseWhole(v); if (n && n > 0 && n !== Number(x.amount)) update(x.id, { amount: n }); }} />
                  ) : <span className="num block px-2 text-end font-semibold">{fmt(Number(x.amount))}</span>}
                </td>
                <td className="hidden px-2 text-xs sm:table-cell">{ownerName(x.handler_user_id)}{x.method !== "cash" ? <span className="text-muted-foreground"> · {x.method}</span> : null}</td>
                <td className="no-print hidden px-1 text-end whitespace-nowrap sm:table-cell">
                  {x.receipt_url && <button className="px-1" title={t("receipt")} onClick={() => openReceipt(x.receipt_url!).catch((e) => toast.error(errMsg(e)))}>📎</button>}
                  {free && <ConfirmButton size="sm" variant="outline" onConfirm={() => update(x.id, { deleted_at: new Date().toISOString() })}>×</ConfirmButton>}
                </td>
              </tr>
            );
          })}
          <NewRow direction={direction} lastDate={rows.at(-1)?.entry_date} listId={listId} me={me} nextNo={rows.length + 1} categoryId={categoryId} onSaved={onChange} />
          <tr className="border-t-2 border-primary bg-secondary font-bold">
            <td colSpan={2} className="px-2 py-2 text-end sm:hidden">{t("total")}</td>
            <td colSpan={4} className="hidden px-2 py-2 text-end sm:table-cell">{t("total")}</td>
            <td className="num px-2 py-2 text-end">{fmt(total)}</td>
            <td colSpan={2} className="hidden sm:table-cell" />
          </tr>
        </tbody>
      </table>
      {!loading && !rows.length && <div className="p-3"><Empty>{t("sheetEmpty")}</Empty></div>}
    </div>
    </div>
  );
}

/** A spreadsheet cell: saves when you leave it; Enter jumps to the next cell. */
function CellInput({ value, onCommit, type = "text", numeric, className = "", placeholder, list, dim }: {
  value: string; onCommit: (v: string) => void; type?: string; numeric?: boolean; className?: string; placeholder?: string; list?: string; dim?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input data-cell type={type} list={list} value={v} placeholder={placeholder} inputMode={numeric ? "numeric" : undefined}
      onChange={(e) => setV(e.target.value)} onBlur={() => onCommit(v)} onKeyDown={nextCellOnEnter}
      className={`h-9 w-full bg-transparent px-2 outline-none focus:bg-primary/5 focus:ring-2 focus:ring-inset focus:ring-primary ${numeric ? "num" : ""} ${dim ? "text-muted-foreground/50 focus:text-foreground" : ""} ${className}`} />
  );
}

function nextCellOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const cells = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-cell]"));
  const i = cells.indexOf(e.currentTarget);
  (cells[i + 1] ?? e.currentTarget).focus();
}

type NewRowProps = {
  direction: "out" | "in"; lastDate: string | undefined; listId: string; me: string;
  categoryId: (name: string) => Promise<string | null>; onSaved: () => void;
};

/** Shared state + save for the blank entry row (desktop) and the entry card (phone). */
function useNewRow({ direction, lastDate, me, categoryId, onSaved }: NewRowProps) {
  const { t } = useT();
  const [f, setF] = useState({ date: "", desc: "", cat: "", amount: "", by: "" });
  const [busy, setBusy] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);
  const date = f.date || (lastDate && lastDate > today() ? today() : lastDate) || today();
  const by = f.by || me;
  async function save() {
    const amount = parseWhole(f.amount);
    if (!amount || amount <= 0) return void toast.error(t("wholeRupees"));
    if (!f.desc.trim() && !f.cat.trim()) return void toast.error(t("description"));
    if (!by) return void toast.error(t(direction === "out" ? "paidBy" : "receivedBy"));
    setBusy(true);
    try {
      const { error } = await supabase.from("transactions").insert({
        entry_date: date, amount, note: f.desc.trim() || null, method: "cash", handler_user_id: by, created_by: await myId(),
        kind: direction === "out" ? "expense" : "other", direction, category: direction === "out" ? "expense" : "income",
        expense_category_id: await categoryId(f.cat),
      });
      if (error) throw error;
      setF({ date: f.date, desc: "", cat: "", amount: "", by: f.by });
      onSaved();
      setTimeout(() => descRef.current?.focus(), 50);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return { f, setF, busy, descRef, date, by, save };
}

function MobileNewRow(props: NewRowProps) {
  const { t } = useT();
  const { f, setF, busy, descRef, date, by, save } = useNewRow(props);
  return (
    <form className="no-print grid grid-cols-2 gap-2 rounded-xl border border-dashed border-primary/50 bg-card p-2 sm:hidden"
      onSubmit={(e) => { e.preventDefault(); save(); }}>
      <input ref={descRef} className="col-span-2 h-10 rounded-md border bg-background px-2" placeholder={t(props.direction === "out" ? "newKharchaPlaceholder" : "newReceivingPlaceholder")} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
      <input className="h-10 rounded-md border bg-background px-2" list={props.listId} placeholder={t("category")} value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} />
      <input className="num h-10 rounded-md border bg-background px-2 text-end font-semibold" inputMode="numeric" placeholder={t("amountRs")} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      <input type="date" className="h-10 rounded-md border bg-background px-2 text-sm" value={date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <OwnerSelect className="h-10 text-sm" value={by} onChange={(v) => setF((x) => ({ ...x, by: v }))} />
      <Button type="submit" className="col-span-2 h-10" disabled={busy || !f.amount}>+ {t("add")}</Button>
    </form>
  );
}

/** Always-open blank row at the bottom of the sheet. */
function NewRow({ nextNo, ...props }: NewRowProps & { nextNo: number }) {
  const { t } = useT();
  const { direction, listId } = props;
  const { f, setF, busy, descRef, date, by, save } = useNewRow(props);
  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); if (f.amount) save(); else nextCellOnEnter(e); }
  };
  const cell = "h-9 w-full bg-transparent px-2 outline-none focus:bg-primary/5 focus:ring-2 focus:ring-inset focus:ring-primary";
  return (
    <tr className="no-print hidden border-t-2 border-dashed border-primary/40 bg-primary/[0.03] sm:table-row">
      <td className="num border-e px-1 text-center text-xs text-primary">{nextNo}</td>
      <td className="border-e p-0"><input data-cell type="date" className={cell} value={date} onChange={(e) => setF({ ...f, date: e.target.value })} onKeyDown={onEnter} /></td>
      <td className="border-e p-0"><input data-cell ref={descRef} className={cell} placeholder={t(direction === "out" ? "newKharchaPlaceholder" : "newReceivingPlaceholder")} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} onKeyDown={onEnter} /></td>
      <td className="border-e p-0"><input data-cell className={cell} list={listId} placeholder={t("category")} value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} onKeyDown={onEnter} /></td>
      <td className="border-e p-0"><input data-cell className={`${cell} num text-end font-semibold`} inputMode="numeric" placeholder="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} onKeyDown={onEnter} /></td>
      <td className="p-0"><OwnerSelect className="h-9 rounded-none border-0 bg-transparent px-1 text-xs" value={by} onChange={(v) => setF((x) => ({ ...x, by: v }))} /></td>
      <td className="px-1"><Button size="sm" className="h-8" disabled={busy || !f.amount} onClick={save}>{t("add")}</Button></td>
    </tr>
  );
}

// ---------------------------------------------------------------- Summary

function Summary({ outRows, inRows, all, categoryOf, ownerName, onChange }: {
  outRows: Txn[]; inRows: Txn[]; all: Txn[]; categoryOf: (x: Txn) => string; ownerName: (id: string | null | undefined) => string; onChange: () => void;
}) {
  const { t } = useT();
  const totalOut = outRows.reduce((s, x) => s + Number(x.amount), 0);
  const group = (rows: Txn[], keyOf: (x: Txn) => string) => {
    const m = new Map<string, { n: number; sum: number }>();
    for (const x of rows) { const k = keyOf(x) || t("uncategorised"); const g = m.get(k) ?? { n: 0, sum: 0 }; g.n++; g.sum += Number(x.amount); m.set(k, g); }
    return [...m].sort((a, b) => b[1].sum - a[1].sum);
  };
  const byCat = group(outRows, categoryOf);
  const byInCat = group(inRows, categoryOf);
  const days = [...new Set([...outRows, ...inRows].map((x) => x.entry_date))].sort().reverse();
  const owners = [...new Set(all.map((x) => x.handler_user_id))];
  const transfers = all.filter((x) => x.kind === "owner_transfer");

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Section title={t("kharchaByCategory")}>
        <table className="w-full text-sm"><tbody>
          {byCat.map(([k, g]) => (
            <tr key={k} className="border-t">
              <td className="py-1.5">{k} <span className="text-xs text-muted-foreground">×{g.n}</span></td>
              <td className="w-28 py-1.5"><div className="h-2 rounded bg-primary/70" style={{ width: `${totalOut ? Math.max(4, (g.sum / totalOut) * 100) : 0}%` }} /></td>
              <td className="num py-1.5 text-end font-semibold">{fmt(g.sum)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-primary font-bold"><td className="py-1.5">{t("total")}</td><td /><td className="num text-end">{fmt(totalOut)}</td></tr>
        </tbody></table>
        {!byCat.length && <Empty />}
      </Section>
      <Section title={t("receivingByType")}>
        <table className="w-full text-sm"><tbody>
          {byInCat.map(([k, g]) => <tr key={k} className="border-t"><td className="py-1.5">{k} <span className="text-xs text-muted-foreground">×{g.n}</span></td><td className="num py-1.5 text-end font-semibold">{fmt(g.sum)}</td></tr>)}
        </tbody></table>
        {!byInCat.length && <Empty />}
      </Section>
      <Section title={t("byDay")}>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start">{t("date")}</th><th className="text-end">{t("out")}</th><th className="text-end">{t("in")}</th></tr></thead>
          <tbody>
            {days.map((d) => (
              <tr key={d} className="border-t">
                <td className="num py-1.5">{fmtDate(d)}</td>
                <td className="num text-end text-destructive">{fmt(outRows.filter((x) => x.entry_date === d).reduce((s, x) => s + Number(x.amount), 0))}</td>
                <td className="num text-end text-success">{fmt(inRows.filter((x) => x.entry_date === d).reduce((s, x) => s + Number(x.amount), 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title={t("byOwner")} actions={<Link href="/owners" className="text-sm text-primary underline">{t("ownersTitle")} →</Link>}>
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start">{t("owner")}</th><th className="text-end">{t("paidTotal")}</th><th className="text-end">{t("receivedTotal")}</th></tr></thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o} className="border-t">
                <td className="py-1.5">{ownerName(o)}</td>
                <td className="num text-end">{fmt(outRows.filter((x) => x.handler_user_id === o).reduce((s, x) => s + Number(x.amount), 0))}</td>
                <td className="num text-end">{fmt(inRows.filter((x) => x.handler_user_id === o).reduce((s, x) => s + Number(x.amount), 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <TransferForm onSaved={onChange} />
        {transfers.length > 0 && (
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {transfers.map((x) => <div key={x.id} className="num">{fmtDate(x.entry_date)} · {ownerName(x.handler_user_id)} → {ownerName(x.to_user_id)} · Rs {fmt(Number(x.amount))}</div>)}
          </div>
        )}
      </Section>
      <ReceiptAttach rows={outRows.filter(isFree)} onSaved={onChange} />
    </div>
  );
}

function TransferForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({ from: "", to: "", amount: "", date: today(), method: "cash" as Method });
  async function save() {
    const amount = parseWhole(f.amount);
    if (!amount || amount <= 0) return void toast.error(t("wholeRupees"));
    if (!f.from || !f.to || f.from === f.to) return void toast.error(t("chooseOtherOwner"));
    const { error } = await supabase.from("transactions").insert({
      entry_date: f.date, amount, kind: "owner_transfer", direction: "out", method: f.method, handler_user_id: f.from, to_user_id: f.to, category: "transfer", created_by: await myId(),
    });
    if (error) return void toast.error(error.message);
    toast.success(t("saved"));
    setF({ ...f, amount: "" });
    onSaved();
  }
  return (
    <div className="no-print mt-3 grid grid-cols-2 gap-2 border-t pt-3">
      <div className="col-span-2 text-sm font-semibold">{t("ownerTransfer")}</div>
      <Field label={t("fromOwner")}><OwnerSelect value={f.from} onChange={(v) => setF((x) => ({ ...x, from: v }))} /></Field>
      <Field label={t("toOwner")}><OwnerSelect value={f.to} onChange={(v) => setF((x) => ({ ...x, to: v }))} /></Field>
      <Field label={t("amount")}><NumInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
      <Field label={t("date")}><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      <Field label={t("method")}><MethodSelect value={f.method} onChange={(v) => setF({ ...f, method: v })} /></Field>
      <div className="flex items-end"><ConfirmButton onConfirm={save} disabled={!f.amount}>{t("save")}</ConfirmButton></div>
    </div>
  );
}

/** Attach a photo of a receipt to any typed kharcha row. */
function ReceiptAttach({ rows, onSaved }: { rows: Txn[]; onSaved: () => void }) {
  const { t } = useT();
  const [id, setId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  async function save() {
    if (!id || !file) return;
    try {
      const path = await uploadReceipt(file);
      const { error } = await supabase.from("transactions").update({ receipt_url: path }).eq("id", id);
      if (error) throw error;
      toast.success(t("saved"));
      setFile(null);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  if (!rows.length) return null;
  return (
    <Section title={t("receiptPhoto")} className="no-print">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select className="h-10 rounded-md border bg-background px-2 text-sm" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">—</option>
          {rows.slice().reverse().map((x) => <option key={x.id} value={x.id}>{fmtDate(x.entry_date)} · {x.note ?? ""} · {fmt(Number(x.amount))}</option>)}
        </select>
        <Input className="h-10" type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button className="h-10" disabled={!id || !file} onClick={save}>{t("save")}</Button>
      </div>
    </Section>
  );
}
