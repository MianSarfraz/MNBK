"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, fmtMonth, useT, type Key } from "@/lib/i18n";
import {
  addDays, amountFor, monthEnd, parseWhole, rateOn, statement, txnEffect, weekStart,
  type Direction, type LedgerItem, type Rate, type TxnKind,
} from "@/lib/kiln-math";
import { errMsg, myId, openReceipt, today, uploadReceipt, useSeasons, WORKER_KINDS, type PartyKind } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BalanceBadge } from "@/components/BalanceBadge";
import { DateInput, Empty, Field, MethodSelect, NumInput, OwnerSelect, PrintHeader, Section, Select, type Method } from "@/components/kit";

type Txn = Tables<"transactions">;
type Action = { key: string; label: Key; kind: TxnKind; direction: Direction; handler: "paidBy" | "receivedBy" };

const ACTIONS: Record<"worker" | "employee" | "customer", Action[]> = {
  worker: [
    { key: "kharcha", label: "kharcha", kind: "kharcha", direction: "out", handler: "paidBy" },
    { key: "pay", label: "payHim", kind: "worker_payment_us", direction: "out", handler: "paidBy" },
    { key: "receive", label: "hePays", kind: "worker_payment_them", direction: "in", handler: "receivedBy" },
    { key: "deduct", label: "deduction", kind: "adjustment", direction: "in", handler: "paidBy" },
    { key: "credit", label: "creditBonus", kind: "adjustment", direction: "out", handler: "paidBy" },
  ],
  employee: [
    { key: "salary", label: "salaryPaid", kind: "salary", direction: "out", handler: "paidBy" },
    { key: "advance", label: "advance", kind: "kharcha", direction: "out", handler: "paidBy" },
    { key: "receive", label: "hePays", kind: "worker_payment_them", direction: "in", handler: "receivedBy" },
    { key: "deduct", label: "deduction", kind: "adjustment", direction: "in", handler: "paidBy" },
    { key: "credit", label: "creditBonus", kind: "adjustment", direction: "out", handler: "paidBy" },
  ],
  customer: [
    { key: "receipt", label: "paymentReceived", kind: "sale_receipt", direction: "in", handler: "receivedBy" },
    { key: "refund", label: "refund", kind: "sale_receipt", direction: "out", handler: "paidBy" },
    { key: "writeoff", label: "discountWriteOff", kind: "adjustment", direction: "out", handler: "paidBy" },
    { key: "charge", label: "extraCharge", kind: "adjustment", direction: "in", handler: "paidBy" },
  ],
};
const actionGroup = (k: PartyKind) => (k === "employee" ? "employee" : k === "customer" ? "customer" : "worker");

/** Label for a stored transaction, from the point of view of this party kind. */
function txnLabel(kind: PartyKind, x: Pick<Txn, "kind" | "direction">): Key {
  const a = ACTIONS[actionGroup(kind)].find((a) => a.kind === x.kind && a.direction === x.direction);
  if (a) return a.label;
  if (x.kind === "expense") return "expense";
  return x.direction === "in" ? "moneyIn" : "moneyOut";
}

type Period = { mode: "all" | "season" | "month" | "week" | "custom"; seasonId?: string | undefined; month?: string | undefined; week?: string | undefined; from?: string | undefined; to?: string | undefined };

export function PartyLedger({ id, initialFrom, initialTo }: { id: string; initialFrom?: string | undefined; initialTo?: string | undefined }) {
  const { t } = useT();
  const qc = useQueryClient();
  const seasons = useSeasons();
  const q = useQuery({
    queryKey: ["party-ledger", id],
    queryFn: async () => {
      const p = await supabase.from("parties").select("*").eq("id", id).single();
      if (p.error) throw p.error;
      const kind = p.data.kind as PartyKind;
      const none = Promise.resolve({ data: [] as never[], error: null });
      const [r, pe, ke, sm, st, tx, wk] = await Promise.all([
        supabase.from("party_rates").select("*").eq("party_id", id).is("deleted_at", null).order("effective_from"),
        kind === "patheer" ? supabase.from("production_entries").select("*").eq("party_id", id).is("deleted_at", null).order("entry_date") : none,
        kind === "rehra" || kind === "nakasi" ? supabase.from("kiln_entries").select("*").eq("party_id", id).is("deleted_at", null).order("entry_date") : none,
        kind === "employee" ? supabase.from("salary_months").select("*").eq("party_id", id).is("deleted_at", null).order("entry_date") : none,
        kind === "customer" ? supabase.from("sale_totals").select("*").eq("customer_id", id).order("entry_date") : none,
        supabase.from("transactions").select("*").eq("party_id", id).is("deleted_at", null).order("entry_date").order("created_at"),
        supabase.from("weeks").select("id, week_number, start_date"),
      ]);
      for (const res of [r, pe, ke, sm, st, tx, wk]) if (res.error) throw res.error;
      return {
        party: p.data, kind, rates: r.data ?? [], production: pe.data ?? [], kiln: ke.data ?? [],
        salary: sm.data ?? [], sales: st.data ?? [], txns: (tx.data ?? []) as Txn[], weeks: wk.data ?? [],
      };
    },
  });

  const [period, setPeriod] = useState<Period>(initialFrom || initialTo ? { mode: "custom", from: initialFrom, to: initialTo } : { mode: "all" });
  const range = useMemo((): { from?: string | undefined; to?: string | undefined } => {
    switch (period.mode) {
      case "season": {
        const s = (seasons.data ?? []).find((x) => x.id === period.seasonId);
        return s ? { from: s.start_date, to: s.end_date } : {};
      }
      case "month": return period.month ? { from: `${period.month}-01`, to: monthEnd(`${period.month}-01`) } : {};
      case "week": return period.week ? { from: weekStart(period.week), to: addDays(weekStart(period.week), 6) } : {};
      case "custom": return { from: period.from || undefined, to: period.to || undefined };
      default: return {};
    }
  }, [period, seasons.data]);

  const view = useMemo(() => {
    if (!q.data) return null;
    const d = q.data;
    const rates = d.rates.map((r) => ({ ...r, rate_per_1000: Number(r.rate_per_1000) })) as Rate[];
    const weekNo = new Map(d.weeks.map((w) => [w.start_date, w.week_number]));
    const wkLabel = (date: string) => { const ws = weekStart(date); const n = weekNo.get(ws); return `${t("week")}${n ? ` #${n}` : ""} (${fmtDate(ws)})`; };
    const items: LedgerItem[] = [];
    let unrated = 0;
    for (const e of d.production) {
      const ws = weekStart(e.entry_date);
      const g = `w|${ws}`;
      if (e.confirmed_count == null) { items.push({ date: e.entry_date, amount: 0, label: wkLabel(ws), group: g, tag: "work", pending: 1 }); continue; }
      const r = rateOn(rates, "earning", e.entry_date);
      if (r == null) unrated++;
      items.push({ date: e.entry_date, amount: r == null ? 0 : amountFor(Number(e.confirmed_count), r), label: wkLabel(ws), group: g, tag: "work", bricks: Number(e.confirmed_count) });
    }
    for (const e of d.kiln) {
      const r = rateOn(rates, "earning", e.entry_date);
      if (r == null) unrated++;
      const ws = weekStart(e.entry_date);
      items.push({ date: e.entry_date, amount: r == null ? 0 : amountFor(Number(e.count), r), label: wkLabel(ws), group: `w|${ws}`, tag: "work", bricks: Number(e.count) });
    }
    for (const s of d.salary) items.push({ date: s.entry_date, amount: Number(s.amount), label: `${t("salaryFor")} ${fmtMonth(s.entry_date)}`, tag: "work", ref: `sm:${s.id}`, note: s.note });
    for (const s of d.sales) items.push({ date: s.entry_date!, amount: -Number(s.total), label: `${t("invoice")} #${s.invoice_no} — ${fmt(Number(s.bricks))} ${t("bricks")}`, tag: "invoice", ref: `sale:${s.sale_id}` });
    for (const x of d.txns) {
      const eff = txnEffect(x.kind as TxnKind, x.direction, Number(x.amount));
      const a = ACTIONS[actionGroup(d.kind)].find((a) => a.kind === x.kind && a.direction === x.direction);
      items.push({ date: x.entry_date, amount: eff, label: t(txnLabel(d.kind, x)), tag: a?.key ?? "other", ref: `tx:${x.id}`, note: x.note });
    }
    const opening = Number(d.party.opening_balance);
    const st = statement(opening, items, range.from, range.to);
    const sum = (tag: string) => st.rows.filter((r) => r.tag === tag).reduce((s, r) => s + Math.abs(r.amount), 0);
    const bricks = st.rows.reduce((s, r) => s + (r.bricks ?? 0), 0);
    const pending = st.rows.reduce((s, r) => s + (r.pending ?? 0), 0);
    const txById = new Map(d.txns.map((x) => [x.id, x]));
    return { st, sum, bricks, pending, unrated, txById, rates: d.rates };
  }, [q.data, range, t]);

  const [form, setForm] = useState({ action: "", amount: "", date: today(), handler: "", method: "cash" as Method, note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (q.error) return <div className="p-8 text-center text-destructive">{errMsg(q.error)}</div>;
  if (!q.data || !view) return <div className="p-8 text-center text-muted-foreground">…</div>;
  const { party, kind } = q.data;
  const isWorker = WORKER_KINDS.includes(kind);
  const actions = kind === "vendor" ? [] : ACTIONS[actionGroup(kind)];
  const action = actions.find((a) => a.key === form.action) ?? actions[0];
  const { st } = view;
  const closing = st.closing;

  async function save() {
    if (!action) return;
    const amount = parseWhole(form.amount);
    if (!amount || amount <= 0) return void toast.error(t("wholeRupees"));
    if (!form.handler) return void toast.error(t(action.handler));
    setBusy(true);
    try {
      const receipt_url = file ? await uploadReceipt(file) : null;
      const { error } = await supabase.from("transactions").insert({
        entry_date: form.date, party_id: id, kind: action.kind, direction: action.direction, amount,
        method: form.method, handler_user_id: form.handler, category: kind, note: form.note.trim() || null,
        receipt_url, created_by: await myId(),
      });
      if (error) throw error;
      toast.success(t("saved"));
      setForm({ ...form, amount: "", note: "" });
      setFile(null);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function voidRef(ref: string) {
    const [type, rid] = ref.split(":") as [string, string];
    const table = type === "tx" ? "transactions" : "salary_months";
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", rid);
    if (error) toast.error(error.message);
    else toast.success(t("voided"));
    qc.invalidateQueries();
  }
  function settleNow() {
    if (closing === 0 || !actions.length) return;
    // Pre-fill the payment that brings the balance to zero.
    const want = actions.find((a) => (closing > 0 ? a.direction === "out" && a.kind !== "adjustment" && a.kind !== "kharcha" : a.direction === "in" && a.kind !== "adjustment"));
    if (want) setForm({ ...form, action: want.key, amount: String(Math.abs(closing)) });
    document.getElementById("pay-form")?.scrollIntoView({ behavior: "smooth" });
  }

  const periodText = range.from || range.to ? `${fmtDate(range.from)} → ${fmtDate(range.to)}` : t("allTime");

  return (
    <div className="space-y-4">
      <PrintHeader title={`${t(kindKey(kind))} ${t("ledger")} — ${party.name}`} sub={periodText} />
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/people/${kind}`} className="text-sm text-primary underline">← {t(kindKey(kind))}</Link>
          <h1 className="text-2xl font-bold">{party.name}</h1>
          <div className="text-muted-foreground"><span className="num">{party.phone}</span> {party.address}</div>
          {!party.is_active && <span className="rounded bg-muted px-2 text-sm">{t("inactive")}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {kind === "customer" && <Link href={`/sales/new?customer=${id}`} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-primary-foreground">{t("newSale")}</Link>}
          <Button variant="outline" onClick={() => window.print()}>{t("print")} / PDF</Button>
        </div>
      </div>

      {/* Period filter */}
      <div className="no-print flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <Field label={t("period")} className="w-40">
          <Select value={period.mode} onChange={(e) => setPeriod({ ...period, mode: e.target.value as Period["mode"] })}>
            <option value="all">{t("allTime")}</option><option value="season">{t("season")}</option>
            <option value="month">{t("month")}</option><option value="week">{t("week")}</option><option value="custom">{t("custom")}</option>
          </Select>
        </Field>
        {period.mode === "season" && (
          <Field label={t("season")} className="w-48">
            <Select value={period.seasonId ?? ""} onChange={(e) => setPeriod({ ...period, seasonId: e.target.value })}>
              <option value="">—</option>
              {(seasons.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}
        {period.mode === "month" && <Field label={t("month")}><Input className="h-10" type="month" value={period.month ?? ""} onChange={(e) => setPeriod({ ...period, month: e.target.value })} /></Field>}
        {period.mode === "week" && <Field label={t("anyDayOfWeek")}><Input className="h-10" type="date" value={period.week ?? ""} onChange={(e) => setPeriod({ ...period, week: e.target.value })} /></Field>}
        {period.mode === "custom" && (<>
          <Field label={t("from")}><Input className="h-10" type="date" value={period.from ?? ""} onChange={(e) => setPeriod({ ...period, from: e.target.value })} /></Field>
          <Field label={t("to")}><Input className="h-10" type="date" value={period.to ?? ""} onChange={(e) => setPeriod({ ...period, to: e.target.value })} /></Field>
        </>)}
        <div className="num pb-3 text-muted-foreground">{periodText}</div>
      </div>

      {/* Statement summary */}
      <section className="register-paper rounded-xl border p-4">
        <h2 className="mb-3 text-xl font-bold text-primary">{t("statement")}</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-lg md:grid-cols-4">
          <dt>{range.from ? t("broughtForward") : t("opening")}</dt><dd className="num">{fmt(st.broughtForward)}</dd>
          {isWorker && <><dt>{t("confirmed")} {t("bricks")}</dt><dd className="num font-semibold">{fmt(view.bricks)}{view.pending ? ` (${fmt(view.pending)} ${t("pending")})` : ""}</dd></>}
          {kind !== "customer" && kind !== "vendor" && <><dt>{kind === "employee" ? t("salaryPosted") : t("earnings")}</dt><dd className="num">+ {fmt(view.sum("work"))}</dd></>}
          {kind === "customer" && <><dt>{t("invoices")}</dt><dd className="num">− {fmt(view.sum("invoice"))}</dd></>}
          {actions.map((a) => {
            const v = view.sum(a.key);
            if (!v) return null;
            const sign = txnEffect(a.kind, a.direction, 1) > 0 ? "+" : "−";
            return <span key={a.key} className="contents"><dt>{t(a.label)}</dt><dd className="num">{sign} {fmt(v)}</dd></span>;
          })}
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t-2 border-primary pt-3 text-2xl font-bold">
          {t("balance")}: <span className="num">{fmt(Math.abs(closing))}</span> <BalanceBadge balance={closing} kind={kind} />
          {closing !== 0 && actions.length > 0 && !range.to && <Button className="no-print" variant="secondary" onClick={settleNow}>{t("settleNow")}</Button>}
        </div>
        {view.unrated > 0 && <p className="mt-2 text-destructive">{t("missingRate")} ({fmt(view.unrated)})</p>}
        <p className="mt-1 text-xs text-muted-foreground">{t(kind === "customer" ? "signHelpCustomer" : "signHelp")}</p>
      </section>

      {/* Payment entry */}
      {actions.length > 0 && (
        <section id="pay-form" className="no-print grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-4">
          <Field label={t("type")}>
            <Select value={action?.key} onChange={(e) => setForm({ ...form, action: e.target.value })}>
              {actions.map((a) => <option key={a.key} value={a.key}>{t(a.label)}</option>)}
            </Select>
          </Field>
          <Field label={t("amount")}><NumInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} placeholder="0" /></Field>
          <Field label={t("date")}><DateInput value={form.date} onChange={(v) => setForm({ ...form, date: v })} /></Field>
          <Field label={action ? t(action.handler) : ""}><OwnerSelect value={form.handler} onChange={(v) => setForm((f) => ({ ...f, handler: v }))} /></Field>
          {action?.kind !== "adjustment" && <Field label={t("method")}><MethodSelect value={form.method} onChange={(v) => setForm({ ...form, method: v })} /></Field>}
          <Field label={t("note")} className="md:col-span-2"><Input className="h-10" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <Field label={t("receiptPhoto")}><Input className="h-10" type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <div className="flex items-end md:col-span-4">
            <ConfirmButton size="lg" onConfirm={save} disabled={!form.amount || busy}
              description={`${action ? t(action.label) : ""}: Rs ${fmt(parseWhole(form.amount) ?? 0)} — ${t("balanceChange")}`}>
              {t("save")}
            </ConfirmButton>
          </div>
        </section>
      )}

      {kind === "employee" && <SalaryPoster partyId={id} monthly={Number(party.monthly_salary)} />}

      {/* Running ledger */}
      <section className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary"><tr>
            <th className="p-2 text-start">{t("date")}</th><th className="p-2 text-start">{t("detail")}</th>
            <th className="p-2">+</th><th className="p-2">−</th><th className="p-2">{t("balance")}</th><th className="no-print" />
          </tr></thead>
          <tbody>
            <tr className="border-t bg-muted/40"><td className="num p-2">{range.from ? fmtDate(range.from) : "—"}</td><td className="p-2">{range.from ? t("broughtForward") : t("opening")}</td><td /><td /><td className="num p-2 text-center font-semibold">{fmt(st.broughtForward)}</td><td className="no-print" /></tr>
            {st.rows.map((r, i) => {
              const tx = r.ref?.startsWith("tx:") ? view.txById.get(r.ref.slice(3)) : undefined;
              return (
                <tr key={i} className="border-t">
                  <td className="num whitespace-nowrap p-2">{fmtDate(r.date)}</td>
                  <td className="p-2">
                    {r.ref?.startsWith("sale:") ? <Link href={`/sales/${r.ref.slice(5)}`} className="text-primary underline">{r.label}</Link> : r.label}
                    {r.bricks ? <span className="num text-sm text-muted-foreground"> — {fmt(r.bricks)} {t("bricks")}</span> : null}
                    {r.pending ? <span className="text-sm text-warning-foreground"> ({fmt(r.pending)} {t("pending")})</span> : null}
                    {r.note ? <span className="text-sm text-muted-foreground"> — {r.note}</span> : null}
                    {tx?.receipt_url && <button className="no-print ms-2 text-sm text-primary underline" onClick={() => openReceipt(tx.receipt_url!).catch((e) => toast.error(errMsg(e)))}>{t("receipt")}</button>}
                  </td>
                  <td className="num p-2 text-center text-success">{r.amount > 0 ? fmt(r.amount) : ""}</td>
                  <td className="num p-2 text-center text-destructive">{r.amount < 0 ? fmt(-r.amount) : ""}</td>
                  <td className={`num p-2 text-center font-semibold ${r.running < 0 ? "text-success" : ""}`}>{fmt(Math.abs(r.running))}{r.running < 0 ? " ⇠" : ""}</td>
                  <td className="no-print p-1">{(r.ref?.startsWith("tx:") || r.ref?.startsWith("sm:")) && <ConfirmButton size="sm" variant="outline" onConfirm={() => voidRef(r.ref!)}>{t("remove")}</ConfirmButton>}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-primary font-bold"><td /><td className="p-2">{t("closingBalance")}</td>
              <td className="num p-2 text-center">{fmt(st.credits)}</td><td className="num p-2 text-center">{fmt(st.debits)}</td>
              <td className="num p-2 text-center">{fmt(Math.abs(closing))}</td><td className="no-print" /></tr>
          </tbody>
        </table>
        {!st.rows.length && <div className="p-4"><Empty /></div>}
      </section>

      {isWorker && <RatesEditor partyId={id} rates={view.rates} />}
      <PartyDetails party={party} />
    </div>
  );
}

export function kindKey(k: PartyKind): Key {
  return ({ patheer: "patheer", rehra: "rehra", nakasi: "nakasi", employee: "employees", customer: "customers", vendor: "vendors" } as const)[k];
}

function SalaryPoster({ partyId, monthly }: { partyId: string; monthly: number }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [amount, setAmount] = useState(monthly ? String(monthly) : "");
  async function post() {
    const a = parseWhole(amount);
    if (!a || a <= 0) return void toast.error(t("wholeRupees"));
    const { error } = await supabase.from("salary_months").insert({ party_id: partyId, entry_date: `${month}-01`, amount: a, created_by: await myId() });
    if (error) return void toast.error(/duplicate|unique/i.test(error.message) ? t("salaryAlreadyPosted") : error.message);
    toast.success(t("saved"));
    qc.invalidateQueries();
  }
  return (
    <Section title={t("postSalary")} className="no-print">
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("month")}><Input className="h-10" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <Field label={t("amount")}><NumInput value={amount} onChange={setAmount} className="w-40" /></Field>
        <ConfirmButton onConfirm={post} disabled={!amount || !month}>{t("postSalary")}</ConfirmButton>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t("postSalaryHelp")}</p>
    </Section>
  );
}

function RatesEditor({ partyId, rates }: { partyId: string; rates: Tables<"party_rates">[] }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [rate, setRate] = useState({ kind: "earning" as "earning" | "kharcha", value: "", from: today() });
  async function addRate() {
    const v = parseWhole(rate.value);
    if (!v || v <= 0) return void toast.error(t("wholeNumbers"));
    const { error } = await supabase.from("party_rates").insert({ party_id: partyId, kind: rate.kind, rate_per_1000: v, effective_from: rate.from, created_by: await myId() });
    if (error) return void toast.error(/duplicate|unique/i.test(error.message) ? t("rateExists") : error.message);
    setRate({ ...rate, value: "" });
    qc.invalidateQueries();
  }
  async function voidRate(rid: string) {
    const { error } = await supabase.from("party_rates").update({ deleted_at: new Date().toISOString() }).eq("id", rid);
    if (error) toast.error(error.message);
    qc.invalidateQueries();
  }
  return (
    <Section title={t("rates")} className="no-print">
      <div className="mb-4 flex flex-wrap gap-2">
        {rates.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-2 rounded bg-muted px-3 py-1">
            {r.kind === "earning" ? t("rate") : t("kharchaRate")}: <span className="num font-semibold">{fmt(Number(r.rate_per_1000))}</span>
            <span className="num text-sm">({t("effectiveFrom")} {fmtDate(r.effective_from)})</span>
            <ConfirmButton size="sm" variant="outline" description={t("rateVoidHelp")} onConfirm={() => voidRate(r.id)}>×</ConfirmButton>
          </span>
        ))}
        {!rates.some((r) => r.kind === "earning") && <span className="text-destructive">{t("missingRate")}</span>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label={t("type")}><Select value={rate.kind} onChange={(e) => setRate({ ...rate, kind: e.target.value as "earning" })}>
          <option value="earning">{t("rate")}</option><option value="kharcha">{t("kharchaRate")}</option>
        </Select></Field>
        <Field label={t("rate")}><NumInput className="w-32" value={rate.value} onChange={(v) => setRate({ ...rate, value: v })} /></Field>
        <Field label={t("effectiveFrom")}><DateInput className="w-44" value={rate.from} onChange={(v) => setRate({ ...rate, from: v })} /></Field>
        <ConfirmButton onConfirm={addRate} disabled={!rate.value} description={t("rateChangeHelp")}>{t("add")}</ConfirmButton>
      </div>
    </Section>
  );
}

function PartyDetails({ party }: { party: Tables<"parties"> }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: party.name, phone: party.phone ?? "", address: party.address ?? "", type: party.party_type ?? "",
    salary: String(party.monthly_salary ?? 0), openAmt: String(Math.abs(Number(party.opening_balance))),
    openDir: Number(party.opening_balance) < 0 ? "they" : "we",
  });
  async function save(patch: Partial<Tables<"parties">>) {
    const { error } = await supabase.from("parties").update(patch).eq("id", party.id);
    if (error) return void toast.error(error.message);
    toast.success(t("saved"));
    qc.invalidateQueries();
  }
  const opening = (parseWhole(f.openAmt) ?? 0) * (f.openDir === "they" ? -1 : 1);
  return (
    <Section title={t("details")} className="no-print">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t("name")}><Input className="h-10 text-lg" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t("phone")}><Input className="num h-10" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label={t("address")}><Input className="h-10" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        {party.kind === "patheer" && (
          <Field label={t("type")}><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="simple">{t("simple")}</option><option value="tile9t">{t("tile9t")}</option><option value="special">{t("specialBrick")}</option>
          </Select></Field>
        )}
        {party.kind === "employee" && <Field label={t("monthlySalary")}><NumInput value={f.salary} onChange={(v) => setF({ ...f, salary: v })} /></Field>}
        <div className="flex items-end">
          <Button size="lg" onClick={() => save({ name: f.name.trim(), phone: f.phone.trim() || null, address: f.address.trim() || null, party_type: f.type || null, monthly_salary: parseWhole(f.salary) ?? 0 })} disabled={!f.name.trim()}>{t("save")}</Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
        <OpeningInput amount={f.openAmt} dir={f.openDir} kind={party.kind as PartyKind} onChange={(amount, dir) => setF({ ...f, openAmt: amount, openDir: dir })} />
        <ConfirmButton variant="outline" disabled={opening === Number(party.opening_balance)} onConfirm={() => save({ opening_balance: opening })}>{t("save")} {t("opening")}</ConfirmButton>
        <div className="flex items-center gap-2 ps-4">
          <Switch checked={party.is_active} onCheckedChange={(v) => save({ is_active: v })} />
          <span>{party.is_active ? t("active") : t("inactive")}</span>
        </div>
      </div>
    </Section>
  );
}

/** Opening balance as amount + direction, so nobody has to think about minus signs. */
export function OpeningInput({ amount, dir, kind, onChange }: { amount: string; dir: string; kind: PartyKind; onChange: (amount: string, dir: string) => void }) {
  const { t } = useT();
  return (
    <>
      <Field label={t("opening")}><NumInput className="w-40" value={amount} onChange={(v) => onChange(v, dir)} placeholder="0" /></Field>
      <Field label={t("whoOwes")}>
        <Select className="w-48" value={dir} onChange={(e) => onChange(amount, e.target.value)}>
          <option value="we">{t(kind === "customer" ? "weOweCustomer" : "weOwe")}</option>
          <option value="they">{t(kind === "customer" ? "customerOwes" : "heOwes")}</option>
        </Select>
      </Field>
    </>
  );
}
