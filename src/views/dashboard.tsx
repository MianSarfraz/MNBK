"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell as BarCell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtDate, fmtMonth, useT } from "@/lib/i18n";
import { addDays, isLoad, LOW_STOCK, monthStart, stockRow, summarize, weekStart } from "@/lib/kiln-math";
import { today, useCustomerAccounts, useLedgers, useSaleLines, useStock } from "@/lib/data";
import { Section, Stat } from "@/components/kit";
import { Sheet } from "@/components/sheet";
import { Outstanding } from "@/views/customers";

export default function Dashboard() {
  const { t } = useT();
  const d = today();
  const from6 = monthStart(addDays(monthStart(d), -150));
  const stock = useStock();
  const accounts = useCustomerAccounts();
  const lines = useSaleLines(from6, d);

  const types = (stock.data ?? []).filter((s) => s.is_active || Number(s.balance) !== 0).sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  const sumStock = (k: "opening" | "produced" | "sold" | "balance") => types.reduce((s, r) => s + Number(r[k]), 0);
  // quantity = bricks only; roray are sold by the load and counted separately.
  const ls = (lines.data ?? []).map((l) => ({ ...l, quantity: isLoad(l.unit) ? 0 : Number(l.quantity), loads: isLoad(l.unit) ? Number(l.quantity) : 0, amount: Number(l.amount) }));
  const qtySub = (xs: typeof ls) => { const b = xs.reduce((s, l) => s + l.quantity, 0), n = xs.reduce((s, l) => s + l.loads, 0); return `${fmt(b)} ${t("bricks")}${n ? ` + ${fmt(n)} ${t("loads")}` : ""}`; };
  const todayLines = ls.filter((l) => l.entry_date === d);
  const monthLines = ls.filter((l) => (l.entry_date ?? "") >= monthStart(d));
  const accts = accounts.data ?? [];
  const totalSales = accts.reduce((s, c) => s + Number(c.purchases), 0);
  const totalPaid = accts.reduce((s, c) => s + Number(c.payments), 0);
  const outstanding = accts.reduce((s, c) => s + Math.max(0, Number(c.outstanding)), 0);
  const nakad = accts.find((c) => c.is_cash);
  const months = summarize(ls, (l) => (l.entry_date ?? "").slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key)).map((g) => ({ ...g, label: fmtMonth(`${g.key}-01`).slice(0, 3) }));
  const topQty = accts.filter((c) => Number(c.bricks) > 0).sort((a, b) => Number(b.bricks) - Number(a.bricks)).slice(0, 5);
  const topAmt = accts.filter((c) => Number(c.purchases) > 0).sort((a, b) => Number(b.purchases) - Number(a.purchases)).slice(0, 5);
  const owing = accts.filter((c) => Number(c.outstanding) !== 0).sort((a, b) => Number(b.outstanding) - Number(a.outstanding)).slice(0, 6);
  const chartStock = types.map((s) => ({ name: s.name_en ?? "", remaining: Number(s.balance), status: stockRow({ opening: Number(s.opening), produced: Number(s.produced), sold: Number(s.sold), adjusted: Number(s.adjusted) }).status }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-bold md:text-2xl">{t("dashboard")} <span className="num text-sm font-normal text-muted-foreground">{fmtDate(d)}</span></h1>
        <div className="no-print flex flex-wrap gap-2">
          <Link href="/sales" className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">+ {t("newSale")}</Link>
          <Link href="/payments" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">+ {t("payment")}</Link>
          <Link href="/production" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">+ {t("production")}</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label={t("remainingStock")} value={sumStock("balance")} sub={`${fmt(sumStock("opening"))} ${t("openingShort")} + ${fmt(sumStock("produced"))} ${t("producedShort")} − ${fmt(sumStock("sold"))} ${t("soldShort")}`} />
        <Stat label={t("salesToday")} value={todayLines.reduce((s, l) => s + l.amount, 0)} money sub={qtySub(todayLines)} />
        <Stat label={t("salesThisMonth")} value={monthLines.reduce((s, l) => s + l.amount, 0)} money sub={qtySub(monthLines)} />
        <Stat label={t("totalOutstanding")} value={outstanding} money tone="bad" />
        <Stat label={t("totalSalesAll")} value={totalSales} money />
        <Stat label={t("cashReceivedAll")} value={totalPaid} money tone="good" />
        <Stat label={t("nakadBikriTotal")} value={Number(nakad?.purchases ?? 0)} money sub={`${fmt(Number(nakad?.bricks ?? 0))} ${t("bricks")}`} />
        <Stat label={t("customersCount")} value={accts.filter((c) => c.is_active).length} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title={t("stockByType")} actions={<Link href="/stock" className="text-sm text-primary underline">{t("stockSummary")} →</Link>}>
          <Sheet>
            <thead><tr><th>{t("brickType")}</th><th className="n">{t("availableCol")}</th><th className="n">{t("sold")}</th><th className="n">{t("remaining")}</th></tr></thead>
            <tbody>
              {types.map((s) => {
                const k = stockRow({ opening: Number(s.opening), produced: Number(s.produced), sold: Number(s.sold), adjusted: Number(s.adjusted) });
                return (
                  <tr key={s.quality_id}>
                    <td className="font-medium">{s.name_en}</td><td className="n num">{fmt(k.available)}</td><td className="n num">{fmt(Number(s.sold))}</td>
                    <td className={`n num font-bold ${k.status === "negative" ? "warn bad" : k.status === "ok" ? "" : "warn"}`}>{fmt(k.remaining)}</td>
                  </tr>
                );
              })}
              <tr className="total"><td>{t("total")}</td><td className="n num">{fmt(sumStock("opening") + sumStock("produced"))}</td><td className="n num">{fmt(sumStock("sold"))}</td><td className="n num">{fmt(sumStock("balance"))}</td></tr>
            </tbody>
          </Sheet>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartStock} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={40} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="remaining" name={t("remaining")} radius={[3, 3, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                  {chartStock.map((c) => <BarCell key={c.name} fill={c.status === "negative" ? "var(--color-destructive)" : c.status === "ok" ? "var(--color-primary)" : "var(--color-warning)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("lowStock")} &lt; {fmt(LOW_STOCK)}</p>
        </Section>

        <Section title={t("salesLast6Months")} actions={<Link href="/sales-reports" className="text-sm text-primary underline">{t("salesReports")} →</Link>}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} width={44} />
                <Tooltip formatter={(v: number) => `Rs ${fmt(v)}`} />
                <Bar dataKey="amount" name={t("salesTotal")} fill="var(--color-primary)" radius={[3, 3, 0, 0]} maxBarSize={56} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Sheet className="mt-3">
            <thead><tr><th>{t("month")}</th><th className="n">{t("bricksCol")}</th><th className="n">{t("amountRs")}</th></tr></thead>
            <tbody>{months.slice().reverse().map((m) => <tr key={m.key}><td>{fmtMonth(`${m.key}-01`)}</td><td className="n num">{fmt(m.quantity)}</td><td className="n num font-semibold">{fmt(m.amount)}</td></tr>)}</tbody>
          </Sheet>
        </Section>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <TopList title={t("topByQuantity")} rows={topQty.map((c) => ({ id: c.party_id!, name: c.name ?? "", value: Number(c.bricks) }))} />
        <TopList title={t("topByAmount")} rows={topAmt.map((c) => ({ id: c.party_id!, name: c.name ?? "", value: Number(c.purchases) }))} money />
        <Section title={t("outstandingBalances")} actions={<Link href="/customers" className="text-sm text-primary underline">{t("customers")} →</Link>}>
          <Sheet>
            <tbody>
              {owing.map((c) => <tr key={c.party_id}><td><Link href={`/customers/${c.party_id}`} className="hover:underline">{c.name}</Link></td><td className="n num"><Outstanding value={Number(c.outstanding)} /></td></tr>)}
              {!owing.length && <tr><td className="ro">{t("settled")}</td></tr>}
            </tbody>
          </Sheet>
        </Section>
      </div>

      <KilnSecondary />
    </div>
  );
}

function TopList({ title, rows, money }: { title: string; rows: { id: string; name: string; value: number }[]; money?: boolean }) {
  const { t } = useT();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Section title={title}>
      <Sheet>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="rn">{i + 1}</td>
              <td><Link href={`/customers/${r.id}`} className="hover:underline">{r.name}</Link><div className="mt-0.5 h-1.5 rounded bg-primary/60" style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }} /></td>
              <td className="n num font-semibold">{money ? `Rs ${fmt(r.value)}` : fmt(r.value)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td className="ro">{t("nothingYet")}</td></tr>}
        </tbody>
      </Sheet>
    </Section>
  );
}

/** Kiln work (patheer / rehra / nakasi) — kept, but secondary to sales and stock. */
function KilnSecondary() {
  const { t } = useT();
  const ws = weekStart(today());
  const we = addDays(ws, 6);
  const week = useQuery({
    queryKey: ["dash-week", ws],
    queryFn: async () => {
      const [pe, ke] = await Promise.all([
        supabase.from("production_entries").select("estimated_count, confirmed_count").is("deleted_at", null).gte("entry_date", ws).lte("entry_date", we),
        supabase.from("kiln_entries").select("stage, count").is("deleted_at", null).gte("entry_date", ws).lte("entry_date", we),
      ]);
      for (const r of [pe, ke]) if (r.error) throw r.error;
      return {
        conf: (pe.data ?? []).reduce((s, r) => s + Number(r.confirmed_count ?? 0), 0),
        loaded: (ke.data ?? []).filter((r) => r.stage === "rehra").reduce((s, r) => s + Number(r.count), 0),
        baked: (ke.data ?? []).filter((r) => r.stage === "nakasi").reduce((s, r) => s + Number(r.count), 0),
      };
    },
  });
  const ledgers = useLedgers();
  const L = ledgers.data ?? [];
  const workers = ["patheer", "rehra", "nakasi", "employee"];
  const weOwe = L.filter((l) => workers.includes(l.party_kind ?? "")).reduce((s, l) => s + Math.max(0, Number(l.balance)), 0);
  const theyOwe = L.filter((l) => workers.includes(l.party_kind ?? "")).reduce((s, l) => s + Math.max(0, -Number(l.balance)), 0);
  return (
    <details className="rounded-xl border bg-card p-3">
      <summary className="cursor-pointer text-sm font-semibold">{t("kilnWork")} · <span className="num font-normal text-muted-foreground">{fmtDate(ws)} → {fmtDate(we)}</span></summary>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label={t("madeConfirmed")} value={week.data?.conf} />
        <Stat label={t("loadedInKiln")} value={week.data?.loaded} />
        <Stat label={t("bakedOut")} value={week.data?.baked} />
        <Stat label={t("weOweWorkers")} value={weOwe} money tone="warn" />
        <Stat label={t("workersOweUs")} value={theyOwe} money tone="good" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <Link href="/weekly" className="rounded-md border px-3 py-1.5">{t("weekly")}</Link>
        <Link href="/rehra" className="rounded-md border px-3 py-1.5">{t("rehra")}</Link>
        <Link href="/nakasi" className="rounded-md border px-3 py-1.5">{t("nakasi")}</Link>
        <Link href="/expenses" className="rounded-md border px-3 py-1.5">{t("expenseKhatta")}</Link>
      </div>
    </details>
  );
}
