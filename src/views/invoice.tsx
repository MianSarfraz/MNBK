"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { amountFor, invoiceTotal, parseWhole } from "@/lib/kiln-math";
import { errMsg, myId, today, useLedgers, useOwners, useQualities } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BalanceBadge } from "@/components/BalanceBadge";
import { DateInput, Field, methodLabel, MethodSelect, NumInput, OwnerSelect, Section, Select, type Method } from "@/components/kit";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const owners = useOwners();
  const qualities = useQualities();
  const ledgers = useLedgers();
  const q = useQuery({
    queryKey: ["sale", id],
    queryFn: async () => {
      const s = await supabase.from("sales").select("*").eq("id", id).single();
      if (s.error) throw s.error;
      const [items, rec, cust, season] = await Promise.all([
        supabase.from("sale_items").select("*").eq("sale_id", id).is("deleted_at", null).order("created_at"),
        supabase.from("transactions").select("*").eq("sale_id", id).is("deleted_at", null).order("entry_date"),
        supabase.from("parties").select("*").eq("id", s.data.customer_id).single(),
        s.data.season_id ? supabase.from("seasons").select("is_closed").eq("id", s.data.season_id).single() : Promise.resolve({ data: null, error: null }),
      ]);
      if (items.error) throw items.error;
      if (rec.error) throw rec.error;
      if (cust.error) throw cust.error;
      return { sale: s.data, items: items.data ?? [], receipts: rec.data ?? [], customer: cust.data, closed: !!season.data?.is_closed };
    },
  });
  const [pay, setPay] = useState({ amount: "", date: today(), method: "cash" as Method, handler: "" });
  const [edit, setEdit] = useState(false);

  if (q.error) return <div className="p-8 text-center text-destructive">{errMsg(q.error)}</div>;
  if (!q.data) return <div className="p-8 text-center text-muted-foreground">…</div>;
  const { sale, items, receipts, customer, closed } = q.data;
  const voided = !!sale.deleted_at;
  const readOnly = closed || voided;
  const lines = items.map((i) => ({ quantity: Number(i.quantity), rate_per_1000: Number(i.rate_per_1000) }));
  // Lines may have been edited below the discount; never crash the page, show the (negative) figure instead.
  const tot = (() => {
    try { return invoiceTotal(lines, Number(sale.discount), Number(sale.delivery_charges)); }
    catch { const g = invoiceTotal(lines); return { ...g, discount: Number(sale.discount), delivery: Number(sale.delivery_charges), total: g.gross - Number(sale.discount) + Number(sale.delivery_charges) }; }
  })();
  const received = receipts.reduce((s, r) => s + (r.direction === "in" ? 1 : -1) * Number(r.amount), 0);
  const balance = Number((ledgers.data ?? []).find((l) => l.party_id === customer.id)?.balance ?? 0);
  const qName = (qid: string) => { const x = (qualities.data ?? []).find((q) => q.id === qid); return x ? (lang === "ur" ? x.name_ur : x.name_en) : "—"; };
  const ownerName = (oid: string) => (owners.data ?? []).find((o) => o.id === oid)?.display_name ?? "—";
  const refresh = () => qc.invalidateQueries();

  async function addPayment() {
    const amount = parseWhole(pay.amount);
    if (!amount || amount <= 0) return void toast.error(t("wholeRupees"));
    if (!pay.handler) return void toast.error(t("receivedBy"));
    const { error } = await supabase.from("transactions").insert({
      entry_date: pay.date, party_id: customer.id, sale_id: id, kind: "sale_receipt", direction: "in", amount,
      method: pay.method, handler_user_id: pay.handler, category: "sale", created_by: await myId(),
    });
    if (error) return void toast.error(error.message);
    toast.success(t("saved"));
    setPay({ ...pay, amount: "" });
    refresh();
  }
  async function update(table: "sales" | "sale_items" | "transactions", rid: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from(table).update(patch as never).eq("id", rid);
    if (error) { toast.error(error.message); return false; }
    refresh();
    return true;
  }
  async function voidInvoice() {
    const now = new Date().toISOString();
    for (const r of receipts) if (!(await update("transactions", r.id, { deleted_at: now }))) return;
    if (await update("sales", id, { deleted_at: now })) {
      toast.success(t("voided"));
      router.push("/sales");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="no-print flex flex-wrap gap-2">
        <Link href="/sales" className="inline-flex h-10 items-center rounded-md border bg-card px-4">← {t("sales")}</Link>
        <Button onClick={() => window.print()}>{t("print")} / PDF</Button>
        {!readOnly && <Button variant="outline" onClick={() => setEdit(!edit)}>{edit ? t("done") : t("edit")}</Button>}
        {!readOnly && <ConfirmButton variant="destructive" description={t("voidInvoiceHelp")} onConfirm={voidInvoice}>{t("voidInvoice")}</ConfirmButton>}
      </div>

      <article className="register-paper rounded-xl border-2 border-primary/40 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-primary pb-3">
          <div>
            <div className="text-3xl font-bold text-primary">{t("appName")}</div>
            <div className="text-lg">{t("invoice")}</div>
          </div>
          <div className="text-end">
            <div className="num text-2xl font-bold">#{fmt(Number(sale.invoice_no))}</div>
            <div className="num">{fmtDate(sale.entry_date)}</div>
            {voided && <div className="rounded bg-destructive px-2 text-destructive-foreground">{t("voided")}</div>}
          </div>
        </header>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-lg">
          <dt className="text-muted-foreground">{t("customer")}</dt><dd className="font-bold">{customer.name} <span className="num text-base font-normal">{customer.phone}</span></dd>
          {customer.address && <><dt className="text-muted-foreground">{t("address")}</dt><dd>{customer.address}</dd></>}
          {sale.vehicle_no && <><dt className="text-muted-foreground">{t("vehicle")}</dt><dd className="num">{sale.vehicle_no}</dd></>}
          {sale.driver_name && <><dt className="text-muted-foreground">{t("driver")}</dt><dd>{sale.driver_name}</dd></>}
        </dl>
        <table className="mt-4 w-full text-lg">
          <thead><tr className="border-b-2 border-primary">
            <th className="p-1 text-start">{t("quality")}</th><th className="p-1">{t("bricks")}</th><th className="p-1">{t("rate")}</th><th className="p-1">{t("amount")}</th>{edit && <th />}
          </tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b">
                <td className="p-1">{qName(i.quality_id)}</td>
                <td className="num p-1 text-center">{edit ? <EditNum value={Number(i.quantity)} onSave={(v) => update("sale_items", i.id, { quantity: v })} /> : fmt(Number(i.quantity))}</td>
                <td className="num p-1 text-center">{edit ? <EditNum value={Number(i.rate_per_1000)} onSave={(v) => update("sale_items", i.id, { rate_per_1000: v })} /> : fmt(Number(i.rate_per_1000))}</td>
                <td className="num p-1 text-center font-semibold">{fmt(amountFor(Number(i.quantity), Number(i.rate_per_1000)))}</td>
                {edit && <td className="p-1"><ConfirmButton size="sm" variant="outline" disabled={items.length === 1} onConfirm={() => update("sale_items", i.id, { deleted_at: new Date().toISOString() })}>×</ConfirmButton></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {edit && <AddLine saleId={id} onDone={refresh} />}
        <div className="ms-auto mt-4 max-w-sm space-y-1 text-lg">
          <div className="flex justify-between"><span>{t("gross")} ({fmt(tot.bricks)} {t("bricks")})</span><span className="num">{fmt(tot.gross)}</span></div>
          <div className="flex justify-between"><span>{t("discount")}</span><span className="num">{edit ? <EditNum value={tot.discount} allowZero onSave={(v) => (v > tot.gross + tot.delivery ? void toast.error(t("discountTooBig")) : update("sales", id, { discount: v }))} /> : `− ${fmt(tot.discount)}`}</span></div>
          <div className="flex justify-between"><span>{t("deliveryCharges")}</span><span className="num">{edit ? <EditNum value={tot.delivery} allowZero onSave={(v) => update("sales", id, { delivery_charges: v })} /> : `+ ${fmt(tot.delivery)}`}</span></div>
          <div className="flex justify-between border-t-2 border-primary pt-1 text-2xl font-bold"><span>{t("invoiceTotal")}</span><span className="num">Rs {fmt(tot.total)}</span></div>
          <div className="flex justify-between text-success"><span>{t("received")}</span><span className="num">{fmt(received)}</span></div>
          <div className="flex justify-between font-bold"><span>{t("invoiceBalance")}</span><span className="num">{fmt(tot.total - received)}</span></div>
        </div>
        {receipts.length > 0 && (
          <div className="mt-4 text-sm">
            {receipts.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 border-t py-1">
                <span className="num">{fmtDate(r.entry_date)}</span>
                <span>{r.direction === "in" ? t("paymentReceived") : t("refund")}</span>
                <span className="num font-semibold">{fmt(Number(r.amount))}</span>
                <span className="text-muted-foreground">{methodLabel(t, r.method)} — {ownerName(r.handler_user_id)}</span>
                {!readOnly && <span className="no-print"><ConfirmButton size="sm" variant="outline" onConfirm={() => update("transactions", r.id, { deleted_at: new Date().toISOString() })}>{t("remove")}</ConfirmButton></span>}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 border-t-2 border-primary pt-2 text-lg">
          {t("customerTotalBalance")}: <span className="num font-bold">{fmt(Math.abs(balance))}</span> <BalanceBadge balance={balance} kind="customer" />
        </div>
        {sale.note && <p className="mt-2 text-muted-foreground">{sale.note}</p>}
        <div className="print-only mt-12 grid grid-cols-2 gap-8 text-center"><div className="border-t pt-1">{t("customer")}</div><div className="border-t pt-1">{t("appName")}</div></div>
      </article>

      {!readOnly && (
        <Section title={t("addPayment")} className="no-print">
          <div className="grid gap-3 md:grid-cols-5">
            <Field label={t("amount")}><NumInput value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} placeholder={fmt(Math.max(0, tot.total - received))} /></Field>
            <Field label={t("date")}><DateInput value={pay.date} onChange={(v) => setPay({ ...pay, date: v })} /></Field>
            <Field label={t("method")}><MethodSelect value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} /></Field>
            <Field label={t("receivedBy")}><OwnerSelect value={pay.handler} onChange={(v) => setPay((p) => ({ ...p, handler: v }))} /></Field>
            <div className="flex items-end"><ConfirmButton size="lg" onConfirm={addPayment} disabled={!pay.amount}>{t("save")}</ConfirmButton></div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("laterPaymentHint")} <Link href={`/party/${customer.id}`} className="text-primary underline">{customer.name}</Link></p>
        </Section>
      )}
    </div>
  );
}

function EditNum({ value, onSave, allowZero }: { value: number; onSave: (v: number) => Promise<boolean> | void; allowZero?: boolean }) {
  const [v, setV] = useState(String(value));
  return (
    <input className="num h-10 w-28 rounded border bg-background text-center" inputMode="numeric" value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = parseWhole(v);
        if (n == null || n < 0 || (!allowZero && n === 0)) { setV(String(value)); return; }
        if (n !== value && window.confirm(`${fmt(value)} → ${fmt(n)} ?`)) onSave(n);
        else setV(String(value));
      }} />
  );
}

function AddLine({ saleId, onDone }: { saleId: string; onDone: () => void }) {
  const { t, lang } = useT();
  const qualities = useQualities();
  const [l, setL] = useState({ quality: "", qty: "", rate: "" });
  async function add() {
    const qty = parseWhole(l.qty), rate = parseWhole(l.rate);
    if (!l.quality || !qty || !rate) return void toast.error(t("incompleteLine"));
    const { error } = await supabase.from("sale_items").insert({ sale_id: saleId, quality_id: l.quality, quantity: qty, rate_per_1000: rate, created_by: await myId() });
    if (error) return void toast.error(error.message);
    setL({ quality: "", qty: "", rate: "" });
    onDone();
  }
  return (
    <div className="no-print mt-2 flex flex-wrap items-end gap-2">
      <Select className="w-48" value={l.quality} onChange={(e) => setL({ ...l, quality: e.target.value })}>
        <option value="">{t("quality")}</option>
        {(qualities.data ?? []).filter((q) => q.kind === "sale" && q.is_active).map((q) => <option key={q.id} value={q.id}>{lang === "ur" ? q.name_ur : q.name_en}</option>)}
      </Select>
      <NumInput className="w-32" value={l.qty} onChange={(v) => setL({ ...l, qty: v })} placeholder={t("bricks")} />
      <NumInput className="w-28" value={l.rate} onChange={(v) => setL({ ...l, rate: v })} placeholder={t("rate")} />
      <ConfirmButton onConfirm={add} disabled={!l.quality || !l.qty || !l.rate}>+ {t("addLine")}</ConfirmButton>
    </div>
  );
}
