"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtMonth, useT } from "@/lib/i18n";
import { addDays, monthEnd, monthStart, parseWhole } from "@/lib/kiln-math";
import { errMsg, fetchAll, myId, paymentId, today, useCustomerAccounts, useOwners } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Empty, METHODS, methodLabel, PageHeader, PrintHeader, Stat, type Method } from "@/components/kit";
import { Cell, LetterRow, Sheet } from "@/components/sheet";

type Txn = Tables<"transactions">;

export default function PaymentsRegister() {
  const { t } = useT();
  const qc = useQueryClient();
  const owners = useOwners();
  const accounts = useCustomerAccounts();
  const [month, setMonth] = useState(monthStart(today()));
  const [allTime, setAllTime] = useState(false);
  const [fCustomer, setFCustomer] = useState("");
  const from = allTime ? "1900-01-01" : month;
  const to = allTime ? "2999-12-31" : monthEnd(month);
  const q = useQuery({
    queryKey: ["payments", from, to],
    queryFn: () => fetchAll<Txn>((a, b) => supabase.from("transactions").select("*").eq("kind", "sale_receipt").is("deleted_at", null)
      .gte("entry_date", from).lte("entry_date", to).order("entry_date").order("ref_no").range(a, b)),
  });
  const customers = accounts.data ?? [];
  const custOf = (id: string | null) => customers.find((c) => c.party_id === id);
  const ownerName = (id: string) => (owners.data ?? []).find((o) => o.id === id)?.display_name ?? "—";
  const rows = useMemo(() => (q.data ?? []).filter((x) => !fCustomer || x.party_id === fCustomer), [q.data, fCustomer]);
  const signed = (x: Txn) => (x.direction === "in" ? 1 : -1) * Number(x.amount);
  const total = rows.reduce((s, x) => s + signed(x), 0);
  const cashTotal = rows.filter((x) => x.method === "cash").reduce((s, x) => s + signed(x), 0);
  const refresh = () => qc.invalidateQueries();

  async function update(id: string, patch: Partial<Txn>) {
    const { error } = await supabase.from("transactions").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }

  return (
    <div className="space-y-3">
      <PrintHeader title={t("paymentsRegister")} sub={allTime ? t("allTime") : fmtMonth(month)} />
      <PageHeader title={t("paymentsRegister")} sub={t("paymentsHelp")} actions={<>
        <Button variant="outline" size="sm" onClick={() => downloadExcel(`payments-${allTime ? "all" : month.slice(0, 7)}`, [{ name: "Payments", rows: [
          ["Payment ID", "Date", "Customer", "Amount", "Method", "Reference", "Received by", "Notes"],
          ...rows.map((x) => [paymentId(x.ref_no), x.entry_date, custOf(x.party_id)?.name ?? "", signed(x), x.method, x.reference ?? "", ownerName(x.handler_user_id), x.note ?? ""]),
          [], ["", "", "Total", total],
        ] }])}>Excel</Button>
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
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("receivedInPeriod")} value={total} money tone="good" />
        <Stat label={t("cashReceived")} value={cashTotal} money />
        <Stat label={t("totalOutstanding")} value={customers.reduce((s, c) => s + Math.max(0, Number(c.outstanding)), 0)} money tone="warn" />
      </div>

      <Sheet minWidth={1000}>
        <thead>
          <LetterRow cols={9} />
          <tr>
            <th className="rn">#</th><th className="w-20">{t("paymentIdCol")}</th><th className="w-36">{t("date")}</th><th>{t("customer")}</th>
            <th className="n w-32">{t("amountRs")}</th><th className="w-28">{t("method")}</th><th className="w-32">{t("referenceNo")}</th><th className="w-36">{t("receivedBy")}</th><th>{t("note")}</th><th className="no-print w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((x, i) => {
            const auto = x.category === "cash_sale";
            return (
              <tr key={x.id} className={i > 0 && rows[i - 1]!.entry_date !== x.entry_date ? "day-start" : ""}>
                <td className="rn">{i + 1}</td>
                <td className="num text-xs">{paymentId(x.ref_no)}</td>
                <td className="c"><Cell type="date" value={x.entry_date} disabled={auto} onCommit={(v) => v && update(x.id, { entry_date: v })} /></td>
                <td className="whitespace-nowrap"><Link href={`/customers/${x.party_id}`} className="hover:underline">{custOf(x.party_id)?.name ?? "—"}</Link>
                  {auto && <span className="ms-1 text-[10px] text-success">{t("paidAuto")}</span>}{x.direction === "out" && <span className="ms-1 text-[10px] text-destructive">{t("refund")}</span>}</td>
                <td className="c"><Cell numeric className="font-semibold" value={String(Number(x.amount))} disabled={auto} onCommit={(v) => { const n = parseWhole(v); if (n && n > 0) update(x.id, { amount: n }); }} /></td>
                <td className="c"><select className="cell" value={x.method} disabled={auto} onChange={(e) => update(x.id, { method: e.target.value as Method })}>
                  {METHODS.map((m) => <option key={m} value={m}>{methodLabel(t, m)}</option>)}
                </select></td>
                <td className="c"><Cell value={x.reference ?? ""} placeholder="—" disabled={auto} onCommit={(v) => update(x.id, { reference: v.trim() || null })} /></td>
                <td className="text-xs">{ownerName(x.handler_user_id)}</td>
                <td className="c"><Cell value={x.note ?? ""} placeholder="—" disabled={auto} onCommit={(v) => update(x.id, { note: v.trim() || null })} /></td>
                <td className="no-print px-1">{!auto && <ConfirmButton size="sm" variant="outline" onConfirm={() => update(x.id, { deleted_at: new Date().toISOString() })}>×</ConfirmButton>}</td>
              </tr>
            );
          })}
          <NewPaymentRow n={rows.length + 1} customers={customers} preset={fCustomer} onSaved={refresh} />
          <tr className="total"><td className="rn" /><td colSpan={3}>{t("total")}</td><td className="n num">{fmt(total)}</td><td colSpan={5} /></tr>
        </tbody>
      </Sheet>
      {!q.isLoading && !rows.length && <Empty>{t("paymentsEmpty")}</Empty>}
    </div>
  );
}

export function NewPaymentRow({ n, customers, preset, onSaved, fixedCustomer }: {
  n: number; customers: Tables<"customer_accounts">[]; preset?: string; onSaved: () => void; fixedCustomer?: string;
}) {
  const { t } = useT();
  const owners = useOwners();
  const [me, setMe] = useState("");
  useEffect(() => { myId().then(setMe).catch(() => {}); }, []);
  const blank = { date: "", customer: "", amount: "", method: "cash" as Method, reference: "", by: "", note: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const customer = fixedCustomer ?? (f.customer || preset || "");
  const acct = customers.find((c) => c.party_id === customer);
  const by = f.by || me;
  const amount = parseWhole(f.amount) ?? 0;
  const after = acct ? Number(acct.outstanding) - amount : 0;
  async function save() {
    if (!customer) return void toast.error(t("chooseCustomer"));
    if (amount <= 0) return void toast.error(t("wholeRupees"));
    if (!by) return void toast.error(t("receivedBy"));
    setBusy(true);
    try {
      const { error } = await supabase.from("transactions").insert({
        entry_date: f.date || today(), party_id: customer, kind: "sale_receipt", direction: "in", amount, method: f.method,
        reference: f.reference.trim() || null, handler_user_id: by, category: "payment", note: f.note.trim() || null, created_by: await myId(),
      });
      if (error) throw error;
      toast.success(`${t("saved")} — Rs ${fmt(amount)}`);
      setF({ ...blank, date: f.date, method: f.method, by: f.by });
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && f.amount) { e.preventDefault(); document.getElementById("pay-save")?.click(); } };
  return (
    <tr className="new no-print">
      <td className="rn">{n}</td>
      <td className="num text-xs text-muted-foreground">{t("new")}</td>
      <td className="c"><input className="cell" type="date" value={f.date || today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></td>
      <td className="c">{fixedCustomer ? <span className="px-2">{acct?.name}</span> : (
        <select className="cell" value={customer} onChange={(e) => setF({ ...f, customer: e.target.value })} aria-label={t("customer")}>
          <option value="">{t("chooseCustomer")}</option>{customers.filter((c) => c.is_active && !c.is_cash).map((c) => <option key={c.party_id} value={c.party_id!}>{c.name}</option>)}
        </select>)}
        {acct && <div className="px-2 pb-0.5 text-[10px] text-muted-foreground">{t("owes")} {fmt(Math.max(0, Number(acct.outstanding)))}{f.amount ? ` → ${after >= 0 ? fmt(after) : `${t("advance")} ${fmt(-after)}`}` : ""}</div>}
      </td>
      <td className="c"><input className="cell n num font-semibold" inputMode="numeric" placeholder="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} onKeyDown={enter} aria-label={t("amountRs")} /></td>
      <td className="c"><select className="cell" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as Method })}>{METHODS.map((m) => <option key={m} value={m}>{methodLabel(t, m)}</option>)}</select></td>
      <td className="c"><input className="cell" placeholder="—" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} onKeyDown={enter} aria-label={t("referenceNo")} /></td>
      <td className="c"><select className="cell text-xs" value={by} onChange={(e) => setF({ ...f, by: e.target.value })}>
        <option value="">—</option>{(owners.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.display_name}</option>)}
      </select></td>
      <td className="c"><input className="cell" placeholder={t("note")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onKeyDown={enter} /></td>
      <td className="px-1">
        <ConfirmButton id="pay-save" size="sm" className="h-7" disabled={busy || !f.amount || !customer} onConfirm={save}
          description={`${acct?.name ?? ""}: Rs ${fmt(amount)} — ${t("balanceChange")}`}>{t("add")}</ConfirmButton>
      </td>
    </tr>
  );
}
