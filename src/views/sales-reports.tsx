"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, fmtMonth, useT, type Key } from "@/lib/i18n";
import { addDays, periodKey, summarize, type Period } from "@/lib/kiln-math";
import { customerId, fetchAll, today, useCustomerAccounts, useQualities, useSaleLines } from "@/lib/data";
import { downloadExcel, type Cell as XCell } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { PageHeader, PrintHeader, Stat } from "@/components/kit";
import { Sheet } from "@/components/sheet";
import { Outstanding } from "@/views/customers";

type Tab = "sales" | "production" | "customers";
const PERIODS: Period[] = ["day", "week", "month", "year"];

export default function SalesReports() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("sales");
  const [range, setRange] = useState({ from: `${today().slice(0, 4)}-01-01`, to: today() });
  const [period, setPeriod] = useState<Period>("month");
  const [fCustomer, setFCustomer] = useState("");
  const [fType, setFType] = useState("");
  const accounts = useCustomerAccounts();
  const qualities = useQualities();
  const linesQ = useSaleLines(range.from, range.to);
  const prodQ = useQuery({
    queryKey: ["production", range.from, range.to],
    queryFn: () => fetchAll<Tables<"kiln_entries">>((a, b) => supabase.from("kiln_entries").select("*").eq("stage", "nakasi").is("deleted_at", null)
      .gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date").order("created_at").range(a, b)),
  });
  const custName = (id: string | null) => (accounts.data ?? []).find((c) => c.party_id === id)?.name ?? "—";
  const typeName = (id: string | null) => (qualities.data ?? []).find((q) => q.id === id)?.name_en ?? "—";
  const label = (k: string) => (period === "month" ? fmtMonth(`${k}-01`) : period === "year" ? k : period === "week" ? `${fmtDate(k)} → ${fmtDate(addDays(k, 6))}` : fmtDate(k));

  const lines = useMemo(() => (linesQ.data ?? [])
    .filter((l) => (!fCustomer || l.customer_id === fCustomer) && (!fType || l.quality_id === fType))
    .map((l) => ({ ...l, quantity: Number(l.quantity), amount: Number(l.amount) })), [linesQ.data, fCustomer, fType]);
  const prod = useMemo(() => (prodQ.data ?? []).filter((p) => !fType || p.quality_id === fType).map((p) => ({ ...p, quantity: Number(p.count), amount: 0 })), [prodQ.data, fType]);
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const totalAmt = lines.reduce((s, l) => s + l.amount, 0);
  const byPeriod = summarize(lines, (l) => periodKey(l.entry_date!, period)).sort((a, b) => b.key.localeCompare(a.key));
  const byCustomer = summarize(lines, (l) => custName(l.customer_id)).sort((a, b) => b.amount - a.amount);
  const byType = summarize(lines, (l) => typeName(l.quality_id)).sort((a, b) => b.quantity - a.quantity);
  const prodByPeriod = summarize(prod, (p) => periodKey(p.entry_date, period)).sort((a, b) => b.key.localeCompare(a.key));
  const prodByType = summarize(prod, (p) => typeName(p.quality_id)).sort((a, b) => b.quantity - a.quantity);
  const prodByFiring = summarize(prod, (p) => p.firing_ref || t("noFiringRef"));
  const customers = (accounts.data ?? []).slice().sort((a, b) => Number(b.outstanding) - Number(a.outstanding));

  function exportXls() {
    const grp = (rows: { key: string; quantity: number; amount: number; count: number }[], name: string, keyLabel = (k: string) => k): { name: string; rows: XCell[][] } =>
      ({ name, rows: [[name, "Entries", "Bricks", "Amount (Rs)"], ...rows.map((g) => [keyLabel(g.key), g.count, g.quantity, g.amount])] });
    downloadExcel(`reports-${range.from}-${range.to}`, [
      grp(byPeriod, `Sales by ${period}`, label), grp(byCustomer, "Sales by customer"), grp(byType, "Sales by brick type"),
      grp(prodByPeriod, `Production by ${period}`, label), grp(prodByType, "Production by type"), grp(prodByFiring, "Production by firing"),
      { name: "Customer balances", rows: [["Customer ID", "Customer", "Opening due", "Bricks", "Purchases", "Payments", "Outstanding (+) / advance (−)"],
        ...customers.map((c) => [customerId(c.ref_no), c.name, Number(c.opening_due), Number(c.bricks), Number(c.purchases), Number(c.payments), Number(c.outstanding)])] },
    ]);
  }

  return (
    <div className="space-y-3">
      <PrintHeader title={t("salesReports")} sub={`${fmtDate(range.from)} → ${fmtDate(range.to)}`} />
      <PageHeader title={t("salesReports")} actions={<>
        <Button variant="outline" size="sm" onClick={exportXls}>Excel</Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>{t("print")}</Button>
      </>} />

      <div className="no-print flex flex-wrap items-center gap-2 text-sm">
        <input type="date" className="h-9 rounded-md border bg-card px-2" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} aria-label={t("from")} />
        <span>→</span>
        <input type="date" className="h-9 rounded-md border bg-card px-2" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} aria-label={t("to")} />
        {([["thisMonth", `${today().slice(0, 7)}-01`], ["thisYear", `${today().slice(0, 4)}-01-01`], ["allTime", "1900-01-01"]] as const).map(([k, from]) => (
          <button key={k} className="h-9 rounded-md border bg-card px-2" onClick={() => setRange({ from, to: today() })}>{t(k as Key)}</button>
        ))}
        <select className="h-9 rounded-md border bg-card px-2" value={fCustomer} onChange={(e) => setFCustomer(e.target.value)} aria-label={t("customer")}>
          <option value="">{t("allCustomers")}</option>{(accounts.data ?? []).map((c) => <option key={c.party_id} value={c.party_id!}>{c.name}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-card px-2" value={fType} onChange={(e) => setFType(e.target.value)} aria-label={t("brickType")}>
          <option value="">{t("allTypes")}</option>{(qualities.data ?? []).filter((q) => q.kind === "nakasi" && q.is_active).map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}
        </select>
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {PERIODS.map((p) => <button key={p} onClick={() => setPeriod(p)} className={`rounded-md px-2.5 py-1 ${period === p ? "bg-primary text-primary-foreground" : ""}`}>{t(`per_${p}` as Key)}</button>)}
        </div>
      </div>

      <div className="no-print flex gap-1 border-b">
        {(["sales", "production", "customers"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-semibold ${tab === k ? "border-b-card bg-card text-primary" : "border-transparent text-muted-foreground"}`}>
            {t(k === "sales" ? "sales" : k === "production" ? "production" : "customerBalances")}
          </button>
        ))}
      </div>

      {tab === "sales" && (<>
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t("bricksSold")} value={totalQty} />
          <Stat label={t("salesTotal")} value={totalAmt} money />
          <Stat label={t("salesCount")} value={lines.length} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Group title={`${t("salesBy")} ${t(`per_${period}` as Key).toLowerCase()}`} rows={byPeriod} keyLabel={label} money />
          <Group title={t("salesByType")} rows={byType} money />
          <Group title={t("salesByCustomer")} rows={byCustomer} money />
        </div>
      </>)}

      {tab === "production" && (<>
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t("bricksProduced")} value={prod.reduce((s, p) => s + p.quantity, 0)} />
          <Stat label={t("firings")} value={prodByFiring.length} />
          <Stat label={t("entries")} value={prod.length} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Group title={`${t("productionBy")} ${t(`per_${period}` as Key).toLowerCase()}`} rows={prodByPeriod} keyLabel={label} />
          <Group title={t("byBrickType")} rows={prodByType} />
          <Group title={t("byFiring")} rows={prodByFiring} />
        </div>
      </>)}

      {tab === "customers" && (
        <Sheet minWidth={820}>
          <thead>
            <tr><th className="rn">#</th><th className="w-16">{t("customerIdCol")}</th><th>{t("customer")}</th><th className="n">{t("openingDue")}</th><th className="n">{t("bricksCol")}</th>
              <th className="n">{t("purchases")}</th><th className="n">{t("paymentsCol")}</th><th className="n">{t("outstandingCol")}</th><th className="w-28">{t("lastSale")}</th></tr>
          </thead>
          <tbody>
            {customers.map((c, i) => (
              <tr key={c.party_id}>
                <td className="rn">{i + 1}</td><td className="num text-xs">{customerId(c.ref_no)}</td>
                <td><Link href={`/customers/${c.party_id}`} className="hover:underline">{c.name}</Link></td>
                <td className="n num">{fmt(Number(c.opening_due))}</td><td className="n num">{fmt(Number(c.bricks))}</td>
                <td className="n num">{fmt(Number(c.purchases))}</td><td className="n num">{fmt(Number(c.payments))}</td>
                <td className="n num"><Outstanding value={Number(c.outstanding)} /></td><td className="num">{fmtDate(c.last_sale)}</td>
              </tr>
            ))}
            <tr className="total"><td className="rn" /><td colSpan={2}>{t("total")}</td>
              {(["opening_due", "bricks", "purchases", "payments", "outstanding"] as const).map((k) => <td key={k} className="n num">{fmt(customers.reduce((s, c) => s + Number(c[k]), 0))}</td>)}<td /></tr>
          </tbody>
        </Sheet>
      )}
    </div>
  );
}

function Group({ title, rows, keyLabel = (k) => k, money }: { title: string; rows: { key: string; quantity: number; amount: number; count: number }[]; keyLabel?: (k: string) => string; money?: boolean }) {
  const { t } = useT();
  const max = Math.max(1, ...rows.map((r) => (money ? r.amount : r.quantity)));
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold">{title}</div>
      <Sheet>
        <thead><tr><th>{title}</th><th className="n w-16">#</th><th className="n w-28">{t("bricksCol")}</th>{money && <th className="n w-32">{t("amountRs")}</th>}<th className="w-24" /></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td className="whitespace-nowrap">{keyLabel(g.key)}</td><td className="n num ro">{g.count}</td>
              <td className="n num">{fmt(g.quantity)}</td>{money && <td className="n num font-semibold">{fmt(g.amount)}</td>}
              <td><div className="h-2 rounded bg-primary/70" style={{ width: `${Math.max(3, ((money ? g.amount : g.quantity) / max) * 100)}%` }} /></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} className="ro">{t("nothingYet")}</td></tr>}
          <tr className="total"><td>{t("total")}</td><td className="n num">{rows.reduce((s, g) => s + g.count, 0)}</td><td className="n num">{fmt(rows.reduce((s, g) => s + g.quantity, 0))}</td>{money && <td className="n num">{fmt(rows.reduce((s, g) => s + g.amount, 0))}</td>}<td /></tr>
        </tbody>
      </Sheet>
    </div>
  );
}
