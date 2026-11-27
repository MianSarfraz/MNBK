"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, fmtMonth, useT } from "@/lib/i18n";
import { addDays, canSell, isLoad, lineAmount, monthEnd, monthStart, parseWhole } from "@/lib/kiln-math";
import { errMsg, fetchAll, myId, saleId, today, useBrickTypes, useCustomerAccounts, useRoray, useSaleLines, useStock } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Empty, Field, NumInput, OwnerSelect, PageHeader, PrintHeader, Stat } from "@/components/kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const roray = useRoray();
  const stock = useStock();
  const accounts = useCustomerAccounts();
  const receiptsQ = useQuery({
    queryKey: ["sale-receipts", from, to],
    queryFn: () => fetchAll<Pick<Tables<"transactions">, "id" | "sale_id" | "amount" | "direction" | "entry_date">>((a, b) =>
      supabase.from("transactions").select("id, sale_id, amount, direction, entry_date").eq("kind", "sale_receipt").is("deleted_at", null)
        .gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
  });

  const customers = accounts.data ?? [];
  const favourites = customers.filter((c) => c.is_favourite && c.is_active);
  const [pick, setPick] = useState({ name: "", n: 0 });
  const custName = (id: string | null) => customers.find((c) => c.party_id === id)?.name ?? "—";
  const items = [...(types.data ?? []), ...(roray.data ?? [])];
  const typeName = (id: string | null) => items.find((q) => q.id === id)?.name_en ?? "(old) " + (id ?? "").slice(0, 4);
  const loadItem = (id: string | null) => (roray.data ?? []).some((q) => q.id === id);
  const remaining = (qid: string) => Number((stock.data ?? []).find((s) => s.quality_id === qid)?.balance ?? 0);
  const lines = useMemo(() => (linesQ.data ?? []).filter((l) => (!fCustomer || l.customer_id === fCustomer) && (!fType || l.quality_id === fType)), [linesQ.data, fCustomer, fType]);
  const paidAtSale = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of receiptsQ.data ?? []) if (r.sale_id) m.set(r.sale_id, (m.get(r.sale_id) ?? 0) + (r.direction === "in" ? 1 : -1) * Number(r.amount));
    return m;
  }, [receiptsQ.data]);
  const totalQty = lines.reduce((s, l) => s + (isLoad(l.unit) ? 0 : Number(l.quantity)), 0);
  const totalLoads = lines.reduce((s, l) => s + (isLoad(l.unit) ? Number(l.quantity) : 0), 0);
  const totalAmt = lines.reduce((s, l) => s + Number(l.amount), 0);
  const received = (receiptsQ.data ?? []).reduce((s, r) => s + (r.direction === "in" ? 1 : -1) * Number(r.amount), 0);
  const outstanding = customers.reduce((s, c) => s + Math.max(0, Number(c.outstanding)), 0);
  const refresh = () => qc.invalidateQueries();

  const [picked, setPicked] = useState<string[]>([]);
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  /** Move a sale to another customer; money taken with the sale moves with it. */
  async function changeCustomer(sale: string, customer: string) {
    const { error } = await supabase.from("sales").update({ customer_id: customer }).eq("id", sale);
    if (error) return void toast.error(error.message);
    const { error: e2 } = await supabase.from("transactions").update({ party_id: customer }).eq("sale_id", sale).is("deleted_at", null);
    if (e2) toast.error(e2.message);
    toast.success(t("saved"));
    refresh();
  }
  /** "Paid at sale" is editable: one receipt is changed (0 removes it); none yet → a receipt is added. */
  async function changePaid(l: Line, amount: number) {
    const rs = (receiptsQ.data ?? []).filter((r) => r.sale_id === l.sale_id && r.direction === "in");
    if (rs.length > 1) return void toast.error(t("paidManyHelp"));
    const r = rs[0];
    const now = new Date().toISOString();
    const { error } = r
      ? await supabase.from("transactions").update(amount > 0 ? { amount } : { deleted_at: now }).eq("id", r.id)
      : amount > 0
        ? await supabase.from("transactions").insert({ entry_date: l.entry_date!, party_id: l.customer_id, sale_id: l.sale_id, kind: "sale_receipt", direction: "in", amount, method: "cash", handler_user_id: await myId(), category: "sale", created_by: await myId() })
        : { error: null };
    if (error) return void toast.error(error.message);
    refresh();
  }
  async function updateSale(id: string, patch: Partial<Tables<"sales">>) {
    const { error } = await supabase.from("sales").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }
  async function updateItem(l: Line, patch: { quantity?: number; rate_per_1000?: number; quality_id?: string }) {
    // Stock check when more bricks of a type would leave the yard.
    const qid = patch.quality_id ?? l.quality_id!;
    if (loadItem(qid) !== isLoad(l.unit)) return void toast.error(t("rorayHelp"));
    const extra = (patch.quantity ?? Number(l.quantity)) - (qid === l.quality_id ? Number(l.quantity) : 0);
    if (!loadItem(qid) && extra > 0 && !canSell(remaining(qid), extra)) return void toast.error(`${t("notEnoughStock")}: ${typeName(qid)} — ${t("available")} ${fmt(remaining(qid))}`);
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
      // Last line of the sale: void the sale and the money taken with it.
      const { error: e1 } = await supabase.from("transactions").update({ deleted_at: now }).eq("sale_id", l.sale_id!).is("deleted_at", null);
      if (e1) return void toast.error(e1.message);
      const { error } = await supabase.from("sales").update({ deleted_at: now }).eq("id", l.sale_id!);
      if (error) return void toast.error(error.message);
    }
    toast.success(t("voided"));
    refresh();
  }

  function exportXls() {
    downloadExcel(`sales-${allTime ? "all" : month.slice(0, 7)}`, [{ name: "Sales Register", rows: [
      ["Sale ID", "Date", "Customer", "Brick type", "Quantity", "Unit", "Rate", "Amount", "Paid at sale", "Vehicle", "Driver", "Notes"],
      ...lines.map((l) => [saleId(l.invoice_no), l.entry_date, custName(l.customer_id), typeName(l.quality_id), Number(l.quantity), isLoad(l.unit) ? "per load" : "per 1000", Number(l.rate_per_1000), Number(l.amount),
        paidAtSale.get(l.sale_id!) ?? 0, l.vehicle_no ?? "", l.driver_name ?? "", l.note ?? ""]),
      [], ["", "", "", "Total bricks", totalQty, "", "", totalAmt], ["", "", "", "Roray loads", totalLoads],
    ] }]);
  }

  let prevSale = "";
  return (
    <div className="space-y-3">
      <PrintHeader title={t("salesRegister")} sub={allTime ? t("allTime") : fmtMonth(month)} />
      <PageHeader title={t("salesRegister")} sub={t("salesRegisterHelp")} actions={<>
        <Link href={picked.length ? `/sales/bill?ids=${picked.join(",")}` : "/sales/bill"} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
          🧾 {picked.length ? `${t("makeInvoice")} (${picked.length})` : t("invoiceGenerator")}</Link>
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
          <option value="">{t("allTypes")}</option><TypeOptions types={types.data ?? []} roray={roray.data ?? []} />
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label={t("bricksSold")} value={totalQty} sub={totalLoads ? `+ ${fmt(totalLoads)} ${t("loads")} roray` : undefined} />
        <Stat label={t("salesTotal")} value={totalAmt} money />
        <Stat label={t("receivedInPeriod")} value={received} money tone="good" />
        <Stat label={t("totalOutstanding")} value={outstanding} money tone="warn" />
      </div>

      <StockStrip />
      <CustomerList id="sale-customers" customers={customers} />
      {favourites.length > 0 && (
        <div className="no-print flex flex-wrap items-center gap-1.5 text-xs">
          <span className="py-1 text-muted-foreground">★ {t("favourites")}:</span>
          {favourites.map((c) => (
            <button key={c.party_id} type="button" className="rounded-full border bg-card px-2.5 py-1 font-medium hover:border-primary"
              onClick={() => setPick((p) => ({ name: c.name ?? "", n: p.n + 1 }))}>{c.name}</button>
          ))}
        </div>
      )}

      <Sheet minWidth={1120}>
        <thead>
          <LetterRow cols={12} />
          <tr>
            <th className="rn">#</th><th className="w-20">{t("saleIdCol")}</th><th className="w-36">{t("date")}</th><th>{t("customer")}</th>
            <th className="w-36">{t("brickType")}</th><th className="n w-28">{t("qtyCol")}</th><th className="n w-28">{t("rateCol")}</th>
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
                <td className="num whitespace-nowrap text-xs">{firstOfSale && <input type="checkbox" className="no-print me-1 align-middle" checked={picked.includes(l.sale_id!)} onChange={() => togglePick(l.sale_id!)} aria-label={`${t("makeInvoice")} ${saleId(l.invoice_no)}`} />}
                  <Link href={`/sales/${l.sale_id}`} className="text-primary hover:underline">{saleId(l.invoice_no)}</Link></td>
                <td className="c">{firstOfSale ? <Cell type="date" value={l.entry_date!} onCommit={(v) => v && updateSale(l.sale_id!, { entry_date: v })} /> : <span className="dim px-2">″</span>}</td>
                <td className="c whitespace-nowrap">{firstOfSale ? (
                  <div className="flex items-center">
                    <select className="cell min-w-0 flex-1" value={l.customer_id ?? ""} onChange={(e) => e.target.value && changeCustomer(l.sale_id!, e.target.value)} aria-label={`${saleId(l.invoice_no)} ${t("customer")}`}>
                      {customers.filter((c) => c.is_active || c.party_id === l.customer_id).map((c) => <option key={c.party_id} value={c.party_id!}>{c.name}</option>)}
                    </select>
                    {isCash && <span className="rounded bg-success/15 px-1 text-[10px] text-success">{t("cash")}</span>}
                    <Link href={`/customers/${l.customer_id}`} className="no-print px-1 text-xs text-muted-foreground hover:text-primary" aria-label={t("customer")}>↗</Link>
                  </div>) : <span className="dim px-2">″</span>}</td>
                <td className="c">
                  <select className="cell" value={l.quality_id ?? ""} onChange={(e) => updateItem(l, { quality_id: e.target.value })} aria-label={t("brickType")}>
                    {!items.some((q) => q.id === l.quality_id) && <option value={l.quality_id ?? ""}>{typeName(l.quality_id)}</option>}
                    {isLoad(l.unit) ? <TypeOptions types={[]} roray={roray.data ?? []} /> : <TypeOptions types={types.data ?? []} roray={[]} />}
                  </select>
                </td>
                <td className="c" title={isLoad(l.unit) ? t("loads") : t("bricks")}><Cell numeric value={String(Number(l.quantity))} label={`${saleId(l.invoice_no)} ${t("quantityCol")}`} onCommit={(v) => { const n = parseWhole(v); if (n && n > 0) updateItem(l, { quantity: n }); }} /></td>
                <td className="c" title={isLoad(l.unit) ? t("perLoad") : t("per1000")}><Cell numeric value={String(Number(l.rate_per_1000))} onCommit={(v) => { const n = parseWhole(v || "0"); if (n != null && n >= 0) updateItem(l, { rate_per_1000: n }); }} /></td>
                <td className="n num font-semibold">{Number(l.rate_per_1000) > 0 ? fmt(Number(l.amount)) : <span className="text-[11px] font-normal text-warning-foreground">{t("rateLater")}</span>}</td>
                <td className="c">{firstOfSale ? <Cell numeric value={String(paidAtSale.get(l.sale_id!) ?? 0)} label={`${saleId(l.invoice_no)} ${t("paidAtSale")}`}
                  onCommit={(v) => { const n = parseWhole(v || "0"); if (n != null && n >= 0) changePaid(l, n); }} /> : null}</td>
                <td className="c">{firstOfSale ? <Cell value={l.vehicle_no ?? ""} placeholder="—" onCommit={(v) => updateSale(l.sale_id!, { vehicle_no: v.trim() || null })} /> : null}</td>
                <td className="c">{firstOfSale ? <Cell value={l.driver_name ?? ""} placeholder="—" onCommit={(v) => updateSale(l.sale_id!, { driver_name: v.trim() || null })} /> : null}</td>
                <td className="c">{firstOfSale ? <Cell value={l.note ?? ""} placeholder="—" onCommit={(v) => updateSale(l.sale_id!, { note: v.trim() || null })} /> : null}</td>
                <td className="no-print px-1"><ConfirmButton size="sm" variant="outline" description={t("voidSaleHelp")} onConfirm={() => voidLine(l)}>×</ConfirmButton></td>
              </tr>
            );
          })}
          <NewSaleRow n={lines.length + 1} customers={customers} types={types.data ?? []} roray={roray.data ?? []} remaining={remaining} lastLines={linesQ.data ?? []} pick={pick} onSaved={refresh} />
          <tr className="total">
            <td className="rn" /><td colSpan={4}>{t("total")}</td>
            <td className="n num">{fmt(totalQty)}{totalLoads ? <div className="text-[11px] font-normal">+ {fmt(totalLoads)} {t("loads")}</div> : null}</td><td /><td className="n num">{fmt(totalAmt)}</td><td colSpan={5} />
          </tr>
        </tbody>
      </Sheet>
      {!linesQ.isLoading && !lines.length && <Empty>{t("salesEmpty")}</Empty>}
    </div>
  );
}

/** Blank rows at the bottom of the register, typed like a sheet: customer by name (a new name adds the customer),
 *  one or more brick types, rate optional. Nakad Bikri asks how much was received (and any discount) on save. */
function NewSaleRow({ n, customers, types, roray, remaining, lastLines, pick, onSaved }: {
  n: number; customers: Tables<"customer_accounts">[]; types: Tables<"qualities">[]; roray: Tables<"qualities">[]; remaining: (qid: string) => number;
  lastLines: Line[]; pick: { name: string; n: number }; onSaved: () => void;
}) {
  const { t } = useT();
  const blankLine = { type: "", qty: "", rate: "" };
  const blank = { date: "", customer: "", vehicle: "", driver: "", note: "", paid: "" };
  const [f, setF] = useState(blank);
  const [lines, setLines] = useState([blankLine]);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<null | { gross: number; save: (paid: number, discount: number, handler: string) => Promise<void> }>(null);
  const [me, setMe] = useState("");
  const qtyRef = useRef<HTMLInputElement>(null);
  useEffect(() => { myId().then(setMe).catch(() => {}); }, []);
  useEffect(() => { if (pick.n) { setF((x) => ({ ...x, customer: pick.name })); qtyRef.current?.focus(); } }, [pick]);
  const date = f.date || today();
  const cust = findCustomer(customers, f.customer);
  const isNew = !!f.customer.trim() && !cust;
  const byLoad = (qid: string) => roray.some((q) => q.id === qid);
  const parsed = lines.map((l) => {
    const qty = parseWhole(l.qty) ?? 0, rate = parseWhole(l.rate) ?? 0, load = byLoad(l.type);
    // Stock warning only (never blocks): bricks of the same type across lines count together.
    const sameType = lines.filter((x) => x.type === l.type).reduce((s, x) => s + (parseWhole(x.qty) ?? 0), 0);
    const over = !!l.type && !load && qty > 0 && !canSell(remaining(l.type), sameType);
    return { ...l, q: qty, r: rate, load, over, amount: qty > 0 ? lineAmount(qty, rate, load ? "load" : "thousand") : 0 };
  });
  const filled = parsed.filter((l) => l.type || l.qty || l.rate);
  const gross = filled.reduce((s, l) => s + l.amount, 0);
  const ready = !!f.customer.trim() && filled.length > 0 && filled.every((l) => l.type && l.q > 0);

  function setLine(i: number, patch: Partial<typeof blankLine>) {
    setLines((ls) => ls.map((l, j) => {
      if (j !== i) return l;
      const next = { ...l, ...patch };
      // Pre-fill the rate this customer (or anyone) last paid for this type.
      if (patch.type && !l.rate) {
        const last = [...lastLines].reverse().find((x) => x.quality_id === patch.type && (!cust || x.customer_id === cust.party_id))
          ?? [...lastLines].reverse().find((x) => x.quality_id === patch.type);
        if (last && Number(last.rate_per_1000) > 0) next.rate = String(Number(last.rate_per_1000));
      }
      return next;
    }));
  }
  async function customerId(): Promise<string> {
    if (cust) return cust.party_id!;
    const name = f.customer.trim().replace(/\s+/g, " ");
    const { data, error } = await supabase.from("parties").insert({ kind: "customer", name, created_by: await myId() }).select("id").single();
    if (error) throw new Error(/unique|duplicate/i.test(error.message) ? t("duplicateCustomer") : error.message);
    toast.success(`${t("newCustomerAdded")}: ${name}`);
    return data.id;
  }
  async function create(paid: number, discount: number, handler: string) {
    setBusy(true);
    try {
      const cid = await customerId();
      const { error } = await supabase.rpc("create_sale", {
        _entry_date: date, _customer_id: cid, _vehicle_no: f.vehicle, _driver_name: f.driver, _discount: discount, _delivery: 0, _note: f.note,
        _items: filled.map((l) => ({ quality_id: l.type, quantity: l.q, rate_per_1000: l.r })), _paid: paid, _method: "cash", _handler: paid > 0 ? handler || me : null,
      });
      if (error) throw error;
      const bricks = filled.filter((l) => !l.load).reduce((s, l) => s + l.q, 0), loads = filled.filter((l) => l.load).reduce((s, l) => s + l.q, 0);
      toast.success(`${t("saved")} — ${bricks ? `${fmt(bricks)} ${t("bricks")}` : ""}${bricks && loads ? " + " : ""}${loads ? `${fmt(loads)} ${t("loads")}` : ""}`);
      if (filled.some((l) => l.over)) toast.warning(t("stockOverWarn"));
      setF({ ...blank, date: f.date, customer: f.customer.trim() });
      setLines([blankLine]);
      setAsk(null);
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  function save() {
    if (!f.customer.trim()) return void toast.error(t("chooseCustomer"));
    if (!ready) return void toast.error(t("incompleteLine"));
    if (cust?.is_cash) return void setAsk({ gross, save: create });
    create(parseWhole(f.paid) ?? 0, 0, me);
  }
  async function toggleFav() {
    if (!cust) return;
    const { error } = await supabase.from("parties").update({ is_favourite: !cust.is_favourite }).eq("id", cust.party_id!);
    if (error) return void toast.error(error.message);
    onSaved();
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && ready) { e.preventDefault(); save(); } };
  const ditto = <span className="dim px-2">″</span>;
  return (<>
    {parsed.map((l, i) => (
      <tr key={i} className="new no-print">
        <td className="rn">{n + i}</td>
        <td className="num text-xs text-muted-foreground">{i === 0 ? t("new") : ""}</td>
        <td className="c">{i === 0 ? <input className="cell" type="date" value={date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label={t("date")} /> : ditto}</td>
        <td className={`c ${isNew && i === 0 ? "warn" : ""}`}>{i === 0 ? (
          <div className="flex items-center">
            <input className="cell min-w-0 flex-1" list="sale-customers" placeholder={t("typeCustomer")} value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} onKeyDown={enter}
              aria-label={t("customer")} title={isNew ? t("newCustomerWillBeAdded") : undefined} />
            {cust && !cust.is_cash && <button type="button" className={`px-1 text-base ${cust.is_favourite ? "text-warning" : "text-muted-foreground"}`} onClick={toggleFav}
              aria-label={cust.is_favourite ? t("unmarkFavourite") : t("markFavourite")} title={cust.is_favourite ? t("unmarkFavourite") : t("markFavourite")}>{cust.is_favourite ? "★" : "☆"}</button>}
            {isNew && <span className="whitespace-nowrap px-1 text-[10px] font-semibold text-primary">{t("new")}</span>}
          </div>) : ditto}</td>
        <td className="c"><select className="cell" value={l.type} onChange={(e) => setLine(i, { type: e.target.value })} aria-label={t("brickType")}>
          <option value="">{t("brickType")}…</option><TypeOptions types={types} roray={roray} left={remaining} />
        </select></td>
        <td className={`c ${l.over ? "warn" : ""}`}><input ref={i === 0 ? qtyRef : undefined} className={`cell n num ${l.over ? "bad" : ""}`} inputMode="numeric" placeholder={l.load ? t("loads") : "0"} value={l.qty}
          onChange={(e) => setLine(i, { qty: e.target.value })} onKeyDown={enter} aria-label={t("quantityCol")}
          title={l.over ? `${t("stockOverWarn")}: ${t("available")} ${fmt(remaining(l.type))}` : undefined} /></td>
        <td className="c"><input className="cell n num" inputMode="numeric" placeholder={l.load ? t("perLoad") : t("rateLater")} value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} onKeyDown={enter} aria-label={t("rateCol")} /></td>
        <td className="n num font-semibold">{l.q > 0 ? (l.r > 0 ? fmt(l.amount) : <span className="text-[11px] font-normal text-muted-foreground">{t("rateLater")}</span>) : ""}</td>
        {i === 0 ? (<>
          <td className="c">{cust?.is_cash ? <span className="px-2 text-[11px] text-muted-foreground">{t("asksOnSave")}</span> : <input className="cell n num" inputMode="numeric" placeholder="0" value={f.paid} onChange={(e) => setF({ ...f, paid: e.target.value })} onKeyDown={enter} aria-label={t("paidAtSale")} />}</td>
          <td className="c"><input className="cell" placeholder="—" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} onKeyDown={enter} aria-label={t("vehicle")} /></td>
          <td className="c"><input className="cell" placeholder="—" value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })} onKeyDown={enter} aria-label={t("driver")} /></td>
          <td className="c"><input className="cell" placeholder={t("note")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onKeyDown={enter} /></td>
          <td className="px-1"><Button size="sm" className="h-7" disabled={busy || !ready} onClick={save}>{t("add")}</Button></td>
        </>) : (<>
          <td colSpan={4} />
          <td className="px-1"><Button size="sm" variant="outline" className="h-7" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={t("remove")}>×</Button></td>
        </>)}
      </tr>
    ))}
    <tr className="new no-print">
      <td className="rn" />
      <td colSpan={12} className="px-2 py-0.5 text-xs">
        <button type="button" className="text-primary hover:underline" onClick={() => setLines((ls) => [...ls, blankLine])}>+ {t("addAnotherType")}</button>
        {filled.length > 1 && <span className="num ms-3 text-muted-foreground">{t("total")}: Rs {fmt(gross)}</span>}
      </td>
    </tr>
    {ask && <ReceivedDialog name={cust?.name ?? ""} gross={ask.gross} me={me} busy={busy} onCancel={() => setAsk(null)} onSave={ask.save} />}
  </>);
}

/** Match a typed customer name (case and spaces ignored). */
export function findCustomer(customers: Tables<"customer_accounts">[], typed: string) {
  const k = typed.trim().replace(/\s+/g, " ").toLowerCase();
  return k ? customers.find((c) => (c.name ?? "").trim().replace(/\s+/g, " ").toLowerCase() === k) : undefined;
}

/** Datalist for typing customers: favourites first. */
export function CustomerList({ id, customers }: { id: string; customers: Tables<"customer_accounts">[] }) {
  const { t } = useT();
  const list = customers.filter((c) => c.is_active).sort((a, b) => Number(!!b.is_favourite) - Number(!!a.is_favourite) || Number(!!b.is_cash) - Number(!!a.is_cash) || (a.name ?? "").localeCompare(b.name ?? ""));
  return <datalist id={id}>{list.map((c) => <option key={c.party_id} value={c.name ?? ""}>{c.is_favourite ? `★ ${t("favourite")}` : c.is_cash ? t("cash") : ""}</option>)}</datalist>;
}

/** Nakad Bikri: "this is the amount — was it received?" Full, a custom amount, or nothing; optional discount. */
function ReceivedDialog({ name, gross, me, busy, onCancel, onSave }: {
  name: string; gross: number; me: string; busy: boolean; onCancel: () => void; onSave: (paid: number, discount: number, handler: string) => Promise<void>;
}) {
  const { t } = useT();
  const [discount, setDiscount] = useState("");
  const [mode, setMode] = useState<"full" | "custom" | "none">("full");
  const [custom, setCustom] = useState("");
  const [handler, setHandler] = useState(me);
  const d = parseWhole(discount) ?? 0;
  const total = gross - d;
  const paid = mode === "full" ? total : mode === "custom" ? parseWhole(custom) ?? 0 : 0;
  const bad = d > gross && gross > 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{name} — Rs {fmt(total)}</DialogTitle>
          <DialogDescription>{t("receivedQ")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={t("discount")}><NumInput value={discount} onChange={setDiscount} placeholder="0" aria-label={t("discount")} /></Field>
          {d > 0 && <p className="num text-sm text-muted-foreground">{fmt(gross)} − {fmt(d)} = <b>{fmt(total)}</b></p>}
          {bad && <p className="text-sm text-destructive">{t("discountTooBig")}</p>}
          <div className="grid gap-2">
            {([["full", `${t("receivedFull")} — Rs ${fmt(Math.max(0, total))}`], ["custom", t("receivedCustom")], ["none", t("receivedNone")]] as const).map(([k, label]) => (
              <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 ${mode === k ? "border-primary bg-primary/5" : ""}`}>
                <input type="radio" name="received" checked={mode === k} onChange={() => setMode(k)} />
                <span className="flex-1 text-sm">{label}</span>
                {k === "custom" && mode === "custom" && <NumInput className="h-8 w-32" value={custom} onChange={setCustom} placeholder="0" autoFocus aria-label={t("receivedCustom")} />}
              </label>
            ))}
          </div>
          {paid > 0 && <Field label={t("receivedBy")}><OwnerSelect value={handler} onChange={setHandler} /></Field>}
          {paid < total && paid >= 0 && <p className="num text-xs text-muted-foreground">{t("stillOwed")}: Rs {fmt(total - paid)}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t("cancel")}</Button>
          <Button disabled={busy || bad || (paid > 0 && !handler)} onClick={() => onSave(paid, d, handler)}>{t("saveSale")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Drop-down options: brick types (rate per 1000, with stock left) and roray (rate per load, no stock). */
export function TypeOptions({ types, roray, left }: { types: Tables<"qualities">[]; roray: Tables<"qualities">[]; left?: (qid: string) => number }) {
  const { t } = useT();
  return (<>
    {types.length > 0 && <optgroup label={t("brickGroup")}>{types.map((q) => <option key={q.id} value={q.id}>{q.name_en}{left ? ` (${fmt(left(q.id))})` : ""}</option>)}</optgroup>}
    {roray.length > 0 && <optgroup label={t("rorayGroup")}>{roray.map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}</optgroup>}
  </>);
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
