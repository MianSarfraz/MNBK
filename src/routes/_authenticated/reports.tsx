import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { amountAtRates, isCashMovement, seasonPnl, type Rate, type TxnKind } from "@/lib/kiln-math";
import { errMsg, fetchAll, PARTY_KINDS, seasonForDate, today, useExpenseCategories, useLedgers, useParties, useSeasons } from "@/lib/data";
import { downloadExcel, downloadJson, objectsToRows, type Cell } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { BalanceBadge } from "@/components/BalanceBadge";
import { kindKey } from "@/components/PartyLedger";
import { DateInput, Empty, Field, PageHeader, PrintHeader, Section, Select, Stat } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Mian Nawaz Bricks" }, { name: "description", content: "Season profit and loss, outstanding balances, statements and exports." }] }),
  component: ReportsPage,
});

type TableName = keyof Database["public"]["Tables"];
const EXPORT_TABLES: TableName[] = [
  "seasons", "weeks", "qualities", "expense_categories", "parties", "party_rates", "production_entries", "kiln_entries",
  "salary_months", "sales", "sale_items", "transactions", "stock_adjustments", "cash_counts", "profiles", "audit_log",
];

function ReportsPage() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const seasons = useSeasons();
  const parties = useParties();
  const ledgers = useLedgers();
  const cats = useExpenseCategories();
  const [seasonId, setSeasonId] = useState("");
  useEffect(() => {
    if (!seasonId && seasons.data?.length) setSeasonId((seasonForDate(seasons.data, today()) ?? seasons.data[0]!).id);
  }, [seasons.data, seasonId]);
  const season = (seasons.data ?? []).find((s) => s.id === seasonId);

  const pnlQ = useQuery({
    queryKey: ["pnl", season?.start_date, season?.end_date],
    enabled: !!season,
    queryFn: async () => {
      const from = season!.start_date, to = season!.end_date;
      const [prod, kiln, sal, sales, tx, rates] = await Promise.all([
        fetchAll<Tables<"production_entries">>((a, b) => supabase.from("production_entries").select("*").is("deleted_at", null).not("confirmed_count", "is", null).gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
        fetchAll<Tables<"kiln_entries">>((a, b) => supabase.from("kiln_entries").select("*").is("deleted_at", null).gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
        fetchAll<Tables<"salary_months">>((a, b) => supabase.from("salary_months").select("*").is("deleted_at", null).gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
        fetchAll<Tables<"sale_totals">>((a, b) => supabase.from("sale_totals").select("*").gte("entry_date", from).lte("entry_date", to).order("sale_id").range(a, b)),
        fetchAll<Tables<"transactions">>((a, b) => supabase.from("transactions").select("*").is("deleted_at", null).gte("entry_date", from).lte("entry_date", to).order("id").range(a, b)),
        fetchAll<Tables<"party_rates">>((a, b) => supabase.from("party_rates").select("*").is("deleted_at", null).order("id").range(a, b)),
      ]);
      return { prod, kiln, sal, sales, tx, rates };
    },
  });

  const pnl = useMemo(() => {
    const d = pnlQ.data;
    if (!d) return null;
    const ratesBy = new Map<string, Rate[]>();
    for (const r of d.rates) {
      const list = ratesBy.get(r.party_id) ?? [];
      list.push({ kind: r.kind, rate_per_1000: Number(r.rate_per_1000), effective_from: r.effective_from });
      ratesBy.set(r.party_id, list);
    }
    const costBy = { patheer: 0, rehra: 0, nakasi: 0 };
    const bricks = { made: 0, loaded: 0, baked: 0 };
    for (const e of d.prod) {
      costBy.patheer += amountAtRates([{ date: e.entry_date, count: Number(e.confirmed_count) }], ratesBy.get(e.party_id) ?? [], "earning");
      bricks.made += Number(e.confirmed_count);
    }
    for (const e of d.kiln) {
      costBy[e.stage] += amountAtRates([{ date: e.entry_date, count: Number(e.count) }], ratesBy.get(e.party_id) ?? [], "earning");
      if (e.stage === "rehra") bricks.loaded += Number(e.count); else bricks.baked += Number(e.count);
    }
    const salaries = d.sal.reduce((s, x) => s + Number(x.amount), 0);
    const sales = d.sales.reduce((s, x) => s + Number(x.total), 0);
    const sold = d.sales.reduce((s, x) => s + Number(x.bricks), 0);
    const expenseTx = d.tx.filter((x) => (x.kind === "expense" || x.kind === "other") && x.direction === "out");
    const expenses = expenseTx.reduce((s, x) => s + Number(x.amount), 0);
    const byCat = new Map<string, number>();
    for (const x of expenseTx) byCat.set(x.expense_category_id ?? "", (byCat.get(x.expense_category_id ?? "") ?? 0) + Number(x.amount));
    const otherIncome = d.tx.filter((x) => x.kind === "other" && x.direction === "in").reduce((s, x) => s + Number(x.amount), 0);
    const cash = d.tx.filter((x) => isCashMovement(x.kind as TxnKind) && x.kind !== "owner_transfer");
    const cashIn = cash.filter((x) => x.direction === "in").reduce((s, x) => s + Number(x.amount), 0);
    const cashOut = cash.filter((x) => x.direction === "out").reduce((s, x) => s + Number(x.amount), 0);
    const kharcha = d.tx.filter((x) => x.kind === "kharcha" && x.direction === "out").reduce((s, x) => s + Number(x.amount), 0);
    const p = seasonPnl({ sales, otherIncome, workerCost: costBy.patheer + costBy.rehra + costBy.nakasi, salaries, expenses });
    return { p, costBy, bricks, sold, byCat, cashIn, cashOut, kharcha };
  }, [pnlQ.data]);

  const catName = (id: string) => { const c = (cats.data ?? []).find((x) => x.id === id); return c ? (lang === "ur" ? c.name_ur : c.name_en) : t("otherExpense"); };
  const bal = new Map((ledgers.data ?? []).map((l) => [l.party_id!, Number(l.balance)]));
  const outstanding = PARTY_KINDS.filter((k) => k !== "vendor").map((k) => {
    const rows = (parties.data ?? []).filter((p) => p.kind === k && (bal.get(p.id) ?? 0) !== 0).map((p) => ({ p, b: bal.get(p.id) ?? 0 })).sort((a, b) => Math.abs(b.b) - Math.abs(a.b));
    return { k, rows, weOwe: rows.reduce((s, r) => s + Math.max(0, r.b), 0), theyOwe: rows.reduce((s, r) => s + Math.max(0, -r.b), 0) };
  });

  const [stmt, setStmt] = useState({ party: "", from: season?.start_date ?? "", to: season?.end_date ?? "" });
  const [exporting, setExporting] = useState(false);

  async function fullExport() {
    setExporting(true);
    try {
      const data: Record<string, Record<string, unknown>[]> = {};
      for (const name of EXPORT_TABLES) {
        data[name] = await fetchAll<Record<string, unknown>>((a, b) => supabase.from(name).select("*").order(name === "audit_log" ? "id" : "created_at").range(a, b) as never);
      }
      const stamp = today();
      downloadJson(`mian-nawaz-bricks-full-export-${stamp}.json`, { exported_at: new Date().toISOString(), tables: data });
      downloadExcel(`mian-nawaz-bricks-full-export-${stamp}`, EXPORT_TABLES.map((n) => ({ name: n, rows: objectsToRows(data[n]!) })));
      toast.success(t("exportDone"));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setExporting(false);
    }
  }

  function pnlExcel() {
    if (!pnl || !season) return;
    const rows: Cell[][] = [
      ["Season", season.name, season.start_date, season.end_date], [],
      ["Sales (invoices)", pnl.p.sales], ["Other income", pnl.p.otherIncome], [],
      ["Patheer earnings", pnl.costBy.patheer], ["Rehra earnings", pnl.costBy.rehra], ["Nakasi earnings", pnl.costBy.nakasi],
      ["Salaries", pnl.p.salaries], ...[...pnl.byCat].map(([c, v]) => [`Expense: ${catName(c)}`, v] as Cell[]), [],
      ["Profit / loss", pnl.p.profit], [], ["Cash in", pnl.cashIn], ["Cash out", pnl.cashOut], ["Kharcha given (advance)", pnl.kharcha], [],
      ["Bricks made (confirmed)", pnl.bricks.made], ["Loaded in kiln", pnl.bricks.loaded], ["Baked out", pnl.bricks.baked], ["Sold", pnl.sold],
    ];
    const out: Cell[][] = [["Kind", "Name", "Balance (+ we owe, − they owe)"], ...outstanding.flatMap((o) => o.rows.map((r) => [o.k, r.p.name, r.b] as Cell[]))];
    downloadExcel(`season-${season.name}`, [{ name: "Profit and loss", rows }, { name: "Outstanding", rows: out }]);
  }

  return (
    <div className="space-y-5">
      <PrintHeader title={`${t("reports")} — ${season?.name ?? ""}`} sub={season ? `${fmtDate(season.start_date)} → ${fmtDate(season.end_date)}` : undefined} />
      <PageHeader title={t("reports")} actions={<>
        <Select className="w-48" value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          {(seasons.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Button variant="outline" onClick={pnlExcel} disabled={!pnl}>Excel</Button>
        <Button variant="outline" onClick={() => window.print()}>{t("print")} / PDF</Button>
      </>} />

      {!season ? <Empty>{t("noSeason")}</Empty> : !pnl ? <Empty>…</Empty> : (
        <section className="register-paper rounded-xl border-2 border-primary/30 p-5">
          <h2 className="mb-3 text-xl font-bold text-primary">{t("profitLoss")} — {season.name}</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-lg">
              <dt className="font-bold">{t("income")}</dt><dd />
              <dt>{t("salesTotal")}</dt><dd className="num">{fmt(pnl.p.sales)}</dd>
              <dt>{t("otherIncome")}</dt><dd className="num">{fmt(pnl.p.otherIncome)}</dd>
              <dt className="mt-2 font-bold">{t("costs")}</dt><dd />
              <dt>{t("patheer")} {t("earnings")}</dt><dd className="num">{fmt(pnl.costBy.patheer)}</dd>
              <dt>{t("rehra")} {t("earnings")}</dt><dd className="num">{fmt(pnl.costBy.rehra)}</dd>
              <dt>{t("nakasi")} {t("earnings")}</dt><dd className="num">{fmt(pnl.costBy.nakasi)}</dd>
              <dt>{t("salaries")}</dt><dd className="num">{fmt(pnl.p.salaries)}</dd>
              {[...pnl.byCat].map(([c, v]) => <span key={c} className="contents"><dt>{catName(c)}</dt><dd className="num">{fmt(v)}</dd></span>)}
            </dl>
            <div className="space-y-3">
              <div className={`rounded-xl border-2 p-4 text-center ${pnl.p.profit >= 0 ? "border-success" : "border-destructive"}`}>
                <div className="text-lg">{pnl.p.profit >= 0 ? t("profit") : t("loss")}</div>
                <div className={`num text-4xl font-bold ${pnl.p.profit >= 0 ? "text-success" : "text-destructive"}`}>Rs {fmt(Math.abs(pnl.p.profit))}</div>
              </div>
              <p className="text-sm text-muted-foreground">{t("pnlHelp")}</p>
              <div className="grid grid-cols-2 gap-2">
                <Stat label={t("cashIn")} value={pnl.cashIn} money tone="good" />
                <Stat label={t("cashOut")} value={pnl.cashOut} money tone="bad" />
                <Stat label={t("madeConfirmed")} value={pnl.bricks.made} />
                <Stat label={t("loadedInKiln")} value={pnl.bricks.loaded} />
                <Stat label={t("bakedOut")} value={pnl.bricks.baked} />
                <Stat label={t("bricksSold")} value={pnl.sold} />
              </div>
            </div>
          </div>
        </section>
      )}

      <Section title={t("statements")} className="no-print">
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("name")} className="min-w-56 flex-1"><Select value={stmt.party} onChange={(e) => setStmt({ ...stmt, party: e.target.value })}>
            <option value="">—</option>
            {PARTY_KINDS.map((k) => (
              <optgroup key={k} label={t(kindKey(k))}>
                {(parties.data ?? []).filter((p) => p.kind === k).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </optgroup>
            ))}
          </Select></Field>
          <Field label={t("from")}><DateInput value={stmt.from || season?.start_date || ""} onChange={(v) => setStmt({ ...stmt, from: v })} /></Field>
          <Field label={t("to")}><DateInput value={stmt.to || season?.end_date || ""} onChange={(v) => setStmt({ ...stmt, to: v })} /></Field>
          <Button size="lg" disabled={!stmt.party} onClick={() => navigate({ to: "/party/$id", params: { id: stmt.party }, search: { from: stmt.from || season?.start_date, to: stmt.to || season?.end_date } })}>{t("openStatement")}</Button>
          <Link to="/owners" className="inline-flex h-12 items-center rounded-md border bg-card px-4">{t("ownersTitle")}</Link>
        </div>
      </Section>

      <Section title={t("outstanding")}>
        <div className="grid gap-4 md:grid-cols-2">
          {outstanding.map((o) => (
            <div key={o.k} className="rounded-lg border p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Link to="/people/$kind" params={{ kind: o.k }} className="text-lg font-bold hover:underline">{t(kindKey(o.k))}</Link>
                <span className="num text-sm"><span className="text-warning-foreground">↑ {fmt(o.weOwe)}</span> · <span className="text-success">↓ {fmt(o.theyOwe)}</span></span>
              </div>
              {!o.rows.length ? <div className="text-sm text-muted-foreground">{t("settled")}</div> : (
                <table className="w-full text-base"><tbody>
                  {o.rows.slice(0, 50).map((r) => (
                    <tr key={r.p.id} className="border-t">
                      <td className="p-1"><Link to="/party/$id" params={{ id: r.p.id }} className="hover:underline">{r.p.name}</Link></td>
                      <td className="num p-1 text-end">{fmt(Math.abs(r.b))}</td>
                      <td className="p-1 text-end"><BalanceBadge balance={r.b} kind={o.k} /></td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">↑ {t("weOwe")} · ↓ {t("heOwes")}</p>
      </Section>

      <Section title={t("backupExport")} className="no-print">
        <p className="mb-3">{t("backupHelp")}</p>
        <Button size="lg" onClick={fullExport} disabled={exporting}>{exporting ? t("saving") : t("fullExport")}</Button>
      </Section>
    </div>
  );
}
