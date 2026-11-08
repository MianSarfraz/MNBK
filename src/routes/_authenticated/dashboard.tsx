import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt, useT } from "@/lib/i18n";
import { addDays, weekStart } from "@/lib/kiln-math";
import { today, useLedgers } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Mian Nawaz Bricks" }, { name: "description", content: "Current week summary." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useT();
  const ws = weekStart(today());
  const we = addDays(ws, 6);
  const week = useQuery({
    queryKey: ["dash-week", ws],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_entries").select("estimated_count, confirmed_count").is("deleted_at", null).gte("entry_date", ws).lte("entry_date", we);
      if (error) throw error;
      const { data: tx } = await supabase.from("transactions").select("amount, direction").is("deleted_at", null).gte("entry_date", ws).lte("entry_date", we);
      return {
        est: (data ?? []).reduce((s, r) => s + Number(r.estimated_count), 0),
        conf: (data ?? []).reduce((s, r) => s + Number(r.confirmed_count ?? 0), 0),
        pending: (data ?? []).filter((r) => r.confirmed_count == null).length,
        out: (tx ?? []).filter((x) => x.direction === "out").reduce((s, x) => s + Number(x.amount), 0),
        inn: (tx ?? []).filter((x) => x.direction === "in").reduce((s, x) => s + Number(x.amount), 0),
      };
    },
  });
  const ledgers = useLedgers();
  const pl = (ledgers.data ?? []).filter((l) => l.party_kind === "patheer");
  const weOwe = pl.reduce((s, l) => s + Math.max(0, Number(l.balance)), 0);
  const theyOwe = pl.reduce((s, l) => s + Math.max(0, -Number(l.balance)), 0);

  const cards = [
    { k: t("estimated"), v: week.data?.est },
    { k: t("confirmed"), v: week.data?.conf },
    { k: t("pending"), v: week.data?.pending },
    { k: `${t("kharcha")} / out`, v: week.data?.out },
    { k: "Cash in", v: week.data?.inn },
    { k: t("totalOwedWorkers"), v: weOwe },
    { k: t("totalOwedUs"), v: theyOwe },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {t("thisWeek")} <span className="num text-lg text-muted-foreground">{ws} → {we}</span>
      </h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.k} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-sm text-muted-foreground">{c.k}</div>
            <div className="num mt-1 text-2xl font-semibold text-primary">{fmt(c.v ?? 0)}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to="/weekly" className="rounded-lg bg-primary px-6 py-4 text-xl text-primary-foreground">{t("weekly")}</Link>
        <Link to="/patheer" className="rounded-lg bg-secondary px-6 py-4 text-xl text-secondary-foreground">{t("patheer")}</Link>
      </div>
    </div>
  );
}
