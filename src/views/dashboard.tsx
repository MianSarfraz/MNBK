"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtDate, useT, type Key } from "@/lib/i18n";
import { addDays, isCashMovement, weekStart, type TxnKind } from "@/lib/kiln-math";
import { today, useLedgers } from "@/lib/data";
import { Stat } from "@/components/kit";

export default function Dashboard() {
  const { t } = useT();
  const ws = weekStart(today());
  const we = addDays(ws, 6);
  const week = useQuery({
    queryKey: ["dash-week", ws],
    queryFn: async () => {
      const [pe, ke, st, tx] = await Promise.all([
        supabase.from("production_entries").select("estimated_count, confirmed_count").is("deleted_at", null).gte("entry_date", ws).lte("entry_date", we),
        supabase.from("kiln_entries").select("stage, count").is("deleted_at", null).gte("entry_date", ws).lte("entry_date", we),
        supabase.from("sale_totals").select("bricks, total").gte("entry_date", ws).lte("entry_date", we),
        supabase.from("transactions").select("amount, direction, kind").is("deleted_at", null).gte("entry_date", ws).lte("entry_date", we),
      ]);
      for (const r of [pe, ke, st, tx]) if (r.error) throw r.error;
      const cash = (tx.data ?? []).filter((x) => isCashMovement(x.kind as TxnKind) && x.kind !== "owner_transfer");
      return {
        est: (pe.data ?? []).reduce((s, r) => s + Number(r.estimated_count), 0),
        conf: (pe.data ?? []).reduce((s, r) => s + Number(r.confirmed_count ?? 0), 0),
        pending: (pe.data ?? []).filter((r) => r.confirmed_count == null && Number(r.estimated_count) > 0).length,
        loaded: (ke.data ?? []).filter((r) => r.stage === "rehra").reduce((s, r) => s + Number(r.count), 0),
        baked: (ke.data ?? []).filter((r) => r.stage === "nakasi").reduce((s, r) => s + Number(r.count), 0),
        sold: (st.data ?? []).reduce((s, r) => s + Number(r.bricks), 0),
        sales: (st.data ?? []).reduce((s, r) => s + Number(r.total), 0),
        out: cash.filter((x) => x.direction === "out").reduce((s, x) => s + Number(x.amount), 0),
        inn: cash.filter((x) => x.direction === "in").reduce((s, x) => s + Number(x.amount), 0),
      };
    },
  });
  const stock = useQuery({
    queryKey: ["dash-stock"],
    queryFn: async () => {
      const [f, r] = await Promise.all([supabase.from("finished_stock").select("balance"), supabase.from("raw_stock").select("balance")]);
      if (f.error) throw f.error;
      if (r.error) throw r.error;
      return { finished: (f.data ?? []).reduce((s, x) => s + Number(x.balance), 0), raw: Number(r.data?.[0]?.balance ?? 0) };
    },
  });
  const ledgers = useLedgers();
  const L = ledgers.data ?? [];
  const sumBy = (kinds: string[], sign: 1 | -1) => L.filter((l) => kinds.includes(l.party_kind ?? "")).reduce((s, l) => s + Math.max(0, sign * Number(l.balance)), 0);
  const workers = ["patheer", "rehra", "nakasi", "employee"];
  const w = week.data;

  const actions: { to: "/weekly" | "/rehra" | "/nakasi" | "/sales/new" | "/expenses" | "/stock"; k: Key; primary?: boolean }[] = [
    { to: "/weekly", k: "weekly", primary: true }, { to: "/sales/new", k: "newSale", primary: true },
    { to: "/rehra", k: "rehra" }, { to: "/nakasi", k: "nakasi" }, { to: "/expenses", k: "expenseKhatta" }, { to: "/stock", k: "stock" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {t("thisWeek")} <span className="num text-lg text-muted-foreground">{fmtDate(ws)} → {fmtDate(we)}</span>
      </h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("madeEstimated")} value={w?.est} />
        <Stat label={t("madeConfirmed")} value={w?.conf} sub={w?.pending ? `${w.pending} ${t("pending")}` : undefined} tone={w?.pending ? "warn" : undefined} />
        <Stat label={t("loadedInKiln")} value={w?.loaded} />
        <Stat label={t("bakedOut")} value={w?.baked} />
        <Stat label={t("bricksSold")} value={w?.sold} sub={w ? `Rs ${fmt(w.sales)}` : undefined} />
        <Stat label={t("cashIn")} value={w?.inn} money tone="good" />
        <Stat label={t("cashOut")} value={w?.out} money tone="bad" />
        <Stat label={t("net")} value={(w?.inn ?? 0) - (w?.out ?? 0)} money />
      </div>

      <h2 className="text-xl font-bold">{t("balances")}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("weOweWorkers")} value={sumBy(workers, 1)} money tone="warn" />
        <Stat label={t("workersOweUs")} value={sumBy(workers, -1)} money tone="good" />
        <Stat label={t("customersOweUs")} value={sumBy(["customer"], -1)} money tone="good" />
        <Stat label={t("customerAdvances")} value={sumBy(["customer"], 1)} money />
        <Stat label={t("finishedStock")} value={stock.data?.finished} />
        <Stat label={t("rawAtYard")} value={stock.data?.raw} />
      </div>

      <div className="flex flex-wrap gap-3">
        {actions.map((a) => (
          <Link key={a.to} href={a.to} className={`rounded-lg px-6 py-4 text-xl ${a.primary ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>{t(a.k)}</Link>
        ))}
        <Link href="/reports" className="rounded-lg border bg-card px-6 py-4 text-xl">{t("reports")}</Link>
      </div>
    </div>
  );
}
