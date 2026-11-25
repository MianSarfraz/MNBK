"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, fmtMonth, useT } from "@/lib/i18n";
import { addDays, amountFor, canSell, monthEnd, monthStart, parseWhole } from "@/lib/kiln-math";
import { errMsg, fetchAll, myId, saleId, today, useBrickTypes, useCustomerAccounts, useSaleLines, useStock } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Empty, PageHeader, PrintHeader, Stat } from "@/components/kit";
import { Cell, LetterRow, Sheet } from "@/components/sheet";

type Line = Tables<"sale_lines">;

export default function SalesRegister() {
  const { t } = useT();
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthStart(today()));
  const [allTime, setAllTime] = useState(false);
  const [fCustomer, setFCustomer] = useState("");
  const [fType, setFType] = useState("");
  const from = allTime ? "1900-01-01" : month;
  const to = allTime ? "2999-12-31" : monthEnd(month);
  const linesQ = useSaleLines(from, to);
  const types = useBrickTypes();
  const stock = useStock();
  const accounts = useCustomerAccounts();
  const receiptsQ = useQuery({
    queryKey: ["sale-receipts", from, to],
    queryFn: () => fetchAll<Pick<Tables<"transactions">, "sale_id" | "amount" | "direction" | "entry_date">>((a, b) =>
      supabase.from("transactions").select("sale_id, amount, direction, entry_date").eq("kind", "sale_receipt").is("deleted_at", null)
        .gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
  });

  const customers = accounts.data ?? [];
  const custName = (id: string | null) => customers.find((c) => c.party_id === id)?.name ?? "—";
  const typeName = (id: string | null) => (types.data ?? []).find((q) => q.id === id)?.name_en ?? "(old) " + (id ?? "").slice(0, 4);
  const remaining = (qid: string) => Number((stock.data ?? []).find((s) => s.quality_id === qid)?.balance ?? 0);
  const lines = useMemo(() => (linesQ.data ?? []).filter((l) => (!fCustomer || l.customer_id === fCustomer) && (!fType || l.quality_id === fType)), [linesQ.data, fCustomer, fType]);
  const paidAtSale = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of receiptsQ.data ?? []) if (r.sale_id) m.set(r.sale_id, (m.get(r.sale_id) ?? 0) + (r.direction === "in" ? 1 : -1) * Number(r.amount));
    return m;
  }, [receiptsQ.data]);
  const totalQty = lines.reduce((s, l) => s + Number(l.quantity), 0);
  const totalAmt = lines.reduce((s, l) => s + Number(l.amount), 0);
  const received = (receiptsQ.data ?? []).reduce((s, r) => s + (r.direction === "in" ? 1 : -1) * Number(r.amount), 0);
  const outstanding = customers.reduce((s, c) => s + Math.max(0, Number(c.outstanding)), 0);
  const refresh = () => qc.invalidateQueries();

  async function updateSale(id: string, patch: Partial<Tables<"sales">>) {
    const { error } = await supabase.from("sales").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }
  async function updateItem(l: Line, patch: { quantity?: number; rate_per_1000?: number; quality_id?: string }) {
    // Stock check when more bricks of a type would leave the yard.
    const qid = patch.quality_id ?? l.quality_id!;
    const extra = (patch.quantity ?? Number(l.quantity)) - (qid === l.quality_id ? Number(l.quantity) : 0);
    if (extra > 0 && !canSell(remaining(qid), extra)) return void toast.error(`${t("notEnoughStock")}: ${typeName(qid)} — ${t("available")} ${fmt(remaining(qid))}`);
    const { error } = await supabase.from("sale_items").update(patch).eq("id", l.item_id!);
    if (error) toast.error(error.message);
    refresh();
  }
  async function voidLine(l: Line) {
    const now = new Date().toISOString();
    const siblings = (linesQ.data ?? []).filter((x) => x.sale_id === l.sale_id);
    if (siblings.length > 1) {
      const { error } = await supabase.from("sale_items").update({ deleted_at: now }).eq("id", l.item_id!);
      if (error) return void toast.error(error.message);
    } else {
      // Last line of the sale: void the sale and money taken with it (Nakad's auto-payment follows by itself).
      const { error: e1 } = await supabase.from("transactions").update({ deleted_at: now }).eq("sale_id", l.sale_id!).neq("category", "cash_sale").is("deleted_at", null);
      if (e1) return void toast.error(e1.message);
      const { error } = await supabase.from("sales").update({ deleted_at: now }).eq("id", l.sale_id!);
      if (error) return void toast.error(error.message);
    }
    toast.success(t("voided"));
    refresh();
  }

  function exportXls() {
    downloadExcel(`sales-${allTime ? "all" : month.slice(0, 7)}`, [{ name: "Sales Register", rows: [
      ["Sale ID", "Date", "Customer", "Brick type", "Quantity", "Rate / 1000", "Amount", "Paid at sale", "Vehicle", "Driver", "Notes"],
      ...lines.map((l) => [saleId(l.invoice_no), l.entry_date, custName(l.customer_id), typeName(l.quality_id), Number(l.quantity), Number(l.rate_per_1000), Number(l.amount),
        paidAtSale.get(l.sale_id!) ?? 0, l.vehicle_no ?? "", l.driver_name ?? "", l.note ?? ""]),
      [], ["", "", "", "Total", totalQty, "", totalAmt],
    ] }]);
  }

  let prevSale = "";
  return (
    <div className="space-y-3">
      <PrintHeader title={t("salesRegister")} sub={allTime ? t("allTime") : fmtMonth(month)} />
      <PageHeader title={t("salesRegister")} sub={t("salesRegisterHelp")} actions={<>
        <Link href="/sales/new" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("multiTypeInvoice")}</Link>
        <Button variant="outline" size="sm" onClick={exportXls}>Excel</Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>{t("print")}</Button>
      </>} />

      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border bg-card">
          <button className="h-9 px-3 text-lg disabled:opacity-40" disabled={allTime} onClick={() => setMonth(monthStart(addDays(month, -1)))} aria-label="previous month">‹</button>
          <span className="min-w-24 text-center text-sm font-semibold">{allTime ? t("allTime") : fmtMonth(month)}</span>
          <button className="h-9 px-3 text-lg disabled:opacity-40" disabled={allTime} onClick={() => setMonth(monthStart(addDays(monthEnd(month), 1)))} aria-label="next month">›</button>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={allTime} onCheckedChange={setAllTime} />{t("allTime")}</label>
        <select className="h-9 rounded-md border bg-card px-2 text-sm" value={fCustomer} onChange={(e) => setFCustomer(e.target.value)} aria-label={t("customer")}>
          <option value="">{t("allCustomers")}</option>{customers.map((c) => <option key={c.party_id} value={c.party_id!}>{c.name}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-card px-2 text-sm" value={fType} onChange={(e) => setFType(e.target.value)} aria-label={t("brickType")}>
          <option value="">{t("allTypes")}</option>{(types.data ?? []).map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label={t("bricksSold")} value={totalQty} />
        <Stat label={t("salesTotal")} value={totalAmt} money />
        <Stat label={t("receivedInPeriod")} value={received} money tone="good" />
        <Stat label={t("totalOutstanding")} value={outstanding} money tone="warn" />
      </div>

      <StockStrip />

      <Sheet minWidth={1120}>
        <thead>
          <LetterRow cols={12} />
          <tr>
            <th className="rn">#</th><th className="w-20">{t("saleIdCol")}</th><th className="w-36">{t("date")}</th><th>{t("customer")}</th>
            <th className="w-36">{t("brickType")}</th><th className="n w-28">{t("quantityCol")}</th><th className="n w-28">{t("ratePer1000")}</th>
            <th className="n w-28">{t("amountRs")}</th><th className="n w-24">{t("paidAtSale")}</th><th className="w-28">{t("vehicle")}</th><th className="w-28">{t("driver")}</th><th>{t("note")}</th><th className="no-print w-10" />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const firstOfSale = l.sale_id !== prevSale;
            prevSale = l.sale_id!;
            const isCash = customers.find((c) => c.party_id === l.customer_id)?.is_cash;
            return (
              <tr key={l.item_id} className={i > 0 && lines[i - 1]!.entry_date !== l.entry_date ? "day-start" : ""}>
                <td className="rn">{i + 1}</td>
                <td className="num text-xs"><Link href={`/sales/${l.sale_id}`} className="text-primary hover:underline">{saleId(l.invoice_no)}</Link></td>
                <td className="c">{firstOfSale ? <Cell type="date" value={l.entry_date!} onCommit={(v) => v && updateSale(l.sale_id!, { entry_date: v })} /> : <span className="dim px-2">″</span>}</td>
                <td className="whitespace-nowrap"><Link href={`/customers/${l.customer_id}`} className="hover:underline">{custName(l.customer_id)}</Link>{isCash && <span className="ms-1 rounded bg-success/15 px-1 text-[10px] text-success">{t("cash")}</span>}</td>
                <td className="c">
                  <select className="cell" value={l.quality_id ?? ""} onChange={(e) => updateItem(l, { quality_id: e.target.value })} aria-label={t("brickType")}>
                    {!(types.data ?? []).some((q) => q.id === l.quality_id) && <option value={l.quality_id ?? ""}>{typeName(l.quality_id)}</option>}
                    {(types.data ?? []).map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}
                  </select>
                </td>
                <td className="c"><Cell numeric value={String(Number(l.quantity))} label={`${saleId(l.invoice_no)} ${t("quantityCol")}`} onCommit={(v) => { const n = parseWhole(v); if (n && n > 0) updateItem(l, { quantity: n }); }} /></td>
                <td className="c"><Cell numeric value={String(Number(l.rate_per_1000))} onCommit={(v) => { const n = parseWhole(v); if (n && n > 0) updateItem(l, { rate_per_1000: n }); }} /></td>
                <td className="n num font-semibold">{fmt(Number(l.amount))}</td>
                <td className="n num ro">{firstOfSale ? fmt(paidAtSale.get(l.sale_id!) ?? 0) : ""}</td>
                <td className="c">{firstOfSale ? <Cell value={l.vehicle_no ?? ""} placeholder="—" onCommit={(v) => updateSale(l.sale_id!, { vehicle_no: v.trim() || null })} /> : null}</td>
                <td className="c">{firstOfSale ? <Cell value={l.driver_name ?? ""} placeholder="—" onCommit={(v) => updateSale(l.sale_id!, { driver_name: v.trim() || null })} /> : null}</td>
                <td className="c">{firstOfSale ? <Cell value={l.note ?? ""} placeholder="—" onCommit={(v) => updateSale(l.sale_id!, { note: v.trim() || null })} /> : null}</td>
                <td className="no-print px-1"><ConfirmButton size="sm" variant="outline" description={t("voidSaleHelp")} onConfirm={() => voidLine(l)}>×</ConfirmButton></td>
              </tr>
            );
          })}
          <NewSaleRow n={lines.length + 1} customers={customers} types={types.data ?? []} remaining={remaining} lastLines={linesQ.data ?? []} onSaved={refresh} />
          <tr className="total">
            <td className="rn" /><td colSpan={4}>{t("total")}</td>
            <td className="n num">{fmt(totalQty)}</td><td /><td className="n num">{fmt(totalAmt)}</td><td colSpan={5} />
          </tr>
        </tbody>
      </Sheet>
      {!linesQ.isLoading && !lines.length && <Empty>{t("salesEmpty")}</Empty>}
    </div>
  );
}

/** Blank row at the bottom of the register: one brick type per sale, like the paper register. */
function NewSaleRow({ n, customers, types, remaining, lastLines, onSaved }: {
  n: number; customers: Tables<"customer_accounts">[]; types: Tables<"qualities">[]; remaining: (qid: string) => number;
  lastLines: Line[]; onSaved: () => void;
}) {
  const { t } = useT();
  const blank = { date: "", customer: "", type: "", qty: "", rate: "", vehicle: "", driver: "", note: "", paid: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState("");
  useEffect(() => { myId().then(setMe).catch(() => {}); }, []);
  const date = f.date || today();
  const qty = parseWhole(f.qty) ?? 0;
  const rate = parseWhole(f.rate) ?? 0;
  const cust = customers.find((c) => c.party_id === f.customer);
  const left = f.type ? remaining(f.type) : 0;
  const tooMuch = !!f.type && qty > 0 && !canSell(left, qty);

  // Pre-fill the rate this customer (or anyone) last paid for this brick type.
  function pickType(type: string) {
    const last = [...lastLines].reverse().find((l) => l.quality_id === type && (!f.customer || l.customer_id === f.customer))
      ?? [...lastLines].reverse().find((l) => l.quality_id === type);
    setF((x) => ({ ...x, type, rate: x.rate || (last ? String(Number(last.rate_per_1000)) : "") }));
  }
  async function save() {
    if (!f.customer) return void toast.error(t("chooseCustomer"));
    if (!f.type) return void toast.error(t("brickType"));
    if (qty <= 0 || rate <= 0) return void toast.error(t("incompleteLine"));
    if (tooMuch) return void toast.error(`${t("notEnoughStock")}: ${t("available")} ${fmt(left)}`);
    setBusy(true);
    try {
      const paid = cust?.is_cash ? 0 : parseWhole(f.paid) ?? 0;
      const { error } = await supabase.rpc("create_sale", {
        _entry_date: date, _customer_id: f.customer, _vehicle_no: f.vehicle, _driver_name: f.driver, _discount: 0, _delivery: 0, _note: f.note,
        _items: [{ quality_id: f.type, quantity: qty, rate_per_1000: rate }], _paid: paid, _method: "cash", _handler: paid > 0 ? me : null,
      });
      if (error) throw error;
      toast.success(`${t("saved")} — ${fmt(qty)} ${t("bricks")}`);
      setF({ ...blank, date: f.date, customer: f.customer });
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && f.qty && f.rate) { e.preventDefault(); save(); } };
  return (
    <tr className="new no-print">
      <td className="rn">{n}</td>
      <td className="num text-xs text-muted-foreground">{t("new")}</td>
      <td className="c"><input className="cell" type="date" value={date} onChange={(e) => setF({ ...f, date: e.target.value })} /></td>
      <td className="c"><select className="cell" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} aria-label={t("customer")}>
        <option value="">{t("chooseCustomer")}</option>{customers.filter((c) => c.is_active).map((c) => <option key={c.party_id} value={c.party_id!}>{c.name}</option>)}
      </select></td>
      <td className="c"><select className="cell" value={f.type} onChange={(e) => pickType(e.target.value)} aria-label={t("brickType")}>
        <option value="">{t("brickType")}…</option>{types.map((q) => <option key={q.id} value={q.id}>{q.name_en} ({fmt(remaining(q.id))})</option>)}
      </select></td>
      <td className={`c ${tooMuch ? "warn" : ""}`}><input className={`cell n num ${tooMuch ? "bad" : ""}`} inputMode="numeric" placeholder="0" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} onKeyDown={enter} aria-label={t("quantityCol")} title={tooMuch ? `${t("notEnoughStock")}: ${t("available")} ${fmt(left)}` : undefined} /></td>
      <td className="c"><input className="cell n num" inputMode="numeric" placeholder="0" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} onKeyDown={enter} aria-label={t("ratePer1000")} /></td>
      <td className="n num font-semibold">{qty > 0 && rate > 0 ? fmt(amountFor(qty, rate)) : ""}</td>
      <td className="c">{cust?.is_cash ? <span className="px-2 text-[11px] text-success">{t("paidAuto")}</span> : <input className="cell n num" inputMode="numeric" placeholder="0" value={f.paid} onChange={(e) => setF({ ...f, paid: e.target.value })} onKeyDown={enter} aria-label={t("paidAtSale")} />}</td>
      <td className="c"><input className="cell" placeholder="—" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} onKeyDown={enter} /></td>
      <td className="c"><input className="cell" placeholder="—" value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })} onKeyDown={enter} /></td>
      <td className="c"><input className="cell" placeholder={t("note")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onKeyDown={enter} /></td>
      <td className="px-1"><Button size="sm" className="h-7" disabled={busy || !f.qty || !f.rate || tooMuch} onClick={save}>{t("add")}</Button></td>
    </tr>
  );
}

/** Remaining stock per brick type, always visible while selling. */
export function StockStrip() {
  const { t } = useT();
  const stock = useStock();
  const rows = (stock.data ?? []).filter((s) => s.is_active);
  if (!rows.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className="py-1 text-muted-foreground">{t("inStock")}:</span>
      {rows.map((s) => {
        const b = Number(s.balance);
        return (
          <Link key={s.quality_id} href="/stock" className={`num rounded-md border px-2 py-1 ${b < 0 ? "border-destructive bg-destructive/10 text-destructive" : b < 10000 ? "border-warning bg-warning/15" : "bg-card"}`}>
            <span className="font-sans font-medium">{s.name_en}</span> {fmt(b)}
          </Link>
        );
      })}
    </div>
  );
}
