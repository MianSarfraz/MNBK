"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtDate, useT, type Key } from "@/lib/i18n";
import { LOW_STOCK, parseWhole, rawStock, stockRow } from "@/lib/kiln-math";
import { LetterRow, Sheet as Grid } from "@/components/sheet";
import { fetchAll, myId, today, useParties, useQualities, useSeasons } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DateInput, Empty, Field, NumInput, PageHeader, PrintHeader, Section, Select, Stat } from "@/components/kit";

const CAT: Record<string, Key> = { normal: "catNormal", nine_t: "cat9t", special: "catSpecial", other: "catOther" };

export default function StockPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const qualities = useQualities();
  const seasons = useSeasons();
  const patheers = useParties("patheer");
  const [seasonId, setSeasonId] = useState("");
  const season = (seasons.data ?? []).find((s) => s.id === seasonId);

  const fin = useQuery({
    queryKey: ["finished-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("finished_stock").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const adj = useQuery({
    queryKey: ["stock-adjustments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_adjustments").select("*").is("deleted_at", null).order("entry_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const raw = useQuery({
    queryKey: ["raw-reconciliation", season?.start_date, season?.end_date],
    queryFn: async () => {
      const made = await fetchAll<{ party_id: string; confirmed_count: number | null; entry_date: string }>((a, b) => {
        let q = supabase.from("production_entries").select("party_id, confirmed_count, entry_date").is("deleted_at", null);
        if (season) q = q.gte("entry_date", season.start_date).lte("entry_date", season.end_date);
        return q.order("id").range(a, b);
      });
      const loaded = await fetchAll<{ source_party_id: string | null; count: number; entry_date: string }>((a, b) => {
        let q = supabase.from("kiln_entries").select("source_party_id, count, entry_date").eq("stage", "rehra").is("deleted_at", null);
        if (season) q = q.gte("entry_date", season.start_date).lte("entry_date", season.end_date);
        return q.order("id").range(a, b);
      });
      return { made, loaded };
    },
  });

  const madeTotal = (raw.data?.made ?? []).reduce((s, e) => s + Number(e.confirmed_count ?? 0), 0);
  const loadedTotal = (raw.data?.loaded ?? []).reduce((s, e) => s + Number(e.count), 0);
  const rawAdj = (adj.data ?? []).filter((a) => a.stock === "raw" && (!season || (a.entry_date >= season.start_date && a.entry_date <= season.end_date))).reduce((s, a) => s + Number(a.delta), 0);
  const rs = rawStock(madeTotal, loadedTotal, rawAdj);
  const byPatheer = (patheers.data ?? []).map((p) => ({
    p,
    made: (raw.data?.made ?? []).filter((e) => e.party_id === p.id).reduce((s, e) => s + Number(e.confirmed_count ?? 0), 0),
    loaded: (raw.data?.loaded ?? []).filter((e) => e.source_party_id === p.id).reduce((s, e) => s + Number(e.count), 0),
  })).filter((r) => r.made || r.loaded);
  const unattributed = (raw.data?.loaded ?? []).filter((e) => !e.source_party_id).reduce((s, e) => s + Number(e.count), 0);

  const finRows = fin.data ?? [];
  const typeRows = finRows.filter((r) => r.is_active || Number(r.opening) || Number(r.produced) || Number(r.sold)).sort((x, y) => Number(x.sort_order) - Number(y.sort_order));
  const cats = ["normal", "nine_t", "special", "other"].filter((c) => finRows.some((r) => r.category === c));
  const unmapped = (qualities.data ?? []).filter((q) => q.kind === "sale" && q.is_active && !q.stock_quality_id);
  const qName = (id: string | null) => { const q = (qualities.data ?? []).find((x) => x.id === id); return q ? q.name_en : t("rawBricks"); };

  async function voidAdj(id: string) {
    const { error } = await supabase.from("stock_adjustments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-4">
      <PrintHeader title={t("stock")} />
      <PageHeader title={t("stockSummary")} sub={t("stockSummaryHelp")} actions={<>
        <Button variant="outline" onClick={() => downloadExcel(`stock-${today()}`, [
          { name: "Stock summary", rows: [["Brick type", "Opening", "Production", "Available", "Sold", "Adjusted", "Remaining"], ...typeRows.map((r) => [r.name_en, Number(r.opening), Number(r.produced), Number(r.opening) + Number(r.produced) + Number(r.adjusted), Number(r.sold), Number(r.adjusted), Number(r.balance)])] },
          { name: "Raw stock", rows: [["Patheer", "Made (confirmed)", "Loaded (with source)"], ...byPatheer.map((r) => [r.p.name, r.made, r.loaded]), ["(no source)", null, unattributed], [], ["Total", rs.made, rs.loaded], ["Adjusted", rs.adjusted], ["At yard", rs.balance]] },
        ])}>Excel</Button>
        <Button variant="outline" onClick={() => window.print()}>{t("print")} / PDF</Button>
      </>} />

      <div className="no-print flex flex-wrap gap-2">
        <Link href="/stock/opening" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("openingStock")}</Link>
        <Link href="/production" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("productionRegister")}</Link>
        <Link href="/sales" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("salesRegister")}</Link>
      </div>

      <div className="text-sm font-semibold">{t("stockSummary")}</div>
      <Grid minWidth={820}>
        <thead>
          <LetterRow cols={8} />
          <tr>
            <th className="rn">#</th><th>{t("brickType")}</th><th className="n">{t("openingStock")}</th><th className="n">{t("production")}</th>
            <th className="n">{t("availableCol")}</th><th className="n">{t("sold")}</th><th className="n">{t("adjusted")}</th><th className="n">{t("remaining")}</th><th className="w-24">{t("status")}</th>
          </tr>
        </thead>
        <tbody>
          {typeRows.map((r, i) => {
            const k = stockRow({ opening: Number(r.opening), produced: Number(r.produced), sold: Number(r.sold), adjusted: Number(r.adjusted) });
            return (
              <tr key={r.quality_id}>
                <td className="rn">{i + 1}</td><td className="font-semibold">{r.name_en}</td>
                <td className="n num">{fmt(Number(r.opening))}</td><td className="n num">{fmt(Number(r.produced))}</td>
                <td className="n num font-semibold">{fmt(k.available)}</td><td className="n num">{fmt(Number(r.sold))}</td>
                <td className="n num ro">{Number(r.adjusted) ? fmt(Number(r.adjusted)) : ""}</td>
                <td className={`n num text-base font-bold ${k.status === "negative" ? "warn bad" : k.status === "low" || k.status === "out" ? "warn" : ""}`}>{fmt(k.remaining)}</td>
                <td className="text-xs">{k.status === "negative" ? <span className="font-semibold text-destructive">⚠ {t("negativeStock")}</span> : k.status === "out" ? t("outOfStock") : k.status === "low" ? <span className="text-warning-foreground">{t("lowStock")}</span> : <span className="text-success">OK</span>}</td>
              </tr>
            );
          })}
          <tr className="total">
            <td className="rn" /><td>{t("total")}</td>
            {(["opening", "produced"] as const).map((key) => <td key={key} className="n num">{fmt(typeRows.reduce((a, r) => a + Number(r[key]), 0))}</td>)}
            <td className="n num">{fmt(typeRows.reduce((a, r) => a + Number(r.opening) + Number(r.produced) + Number(r.adjusted), 0))}</td>
            <td className="n num">{fmt(typeRows.reduce((a, r) => a + Number(r.sold), 0))}</td>
            <td className="n num">{fmt(typeRows.reduce((a, r) => a + Number(r.adjusted), 0))}</td>
            <td className="n num">{fmt(typeRows.reduce((a, r) => a + Number(r.balance), 0))}</td><td />
          </tr>
        </tbody>
      </Grid>
      <p className="text-xs text-muted-foreground">{t("stockFormula")} · {t("lowStock")} &lt; {fmt(LOW_STOCK)}</p>
      {typeRows.some((r) => Number(r.balance) < 0) && <p className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive">⚠ {t("negativeStockHelp")}</p>}

      <Section title={t("rawStock")} actions={
        <Select className="w-48" value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          <option value="">{t("allTime")}</option>{(seasons.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("madeConfirmed")} value={rs.made} />
          <Stat label={t("loadedInKiln")} value={rs.loaded} />
          <Stat label={t("adjusted")} value={rs.adjusted} />
          <Stat label={t("rawAtYard")} value={rs.balance} tone={rs.balance < 0 ? "bad" : undefined} />
        </div>
        {byPatheer.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="sheet">
              <thead><tr className="text-muted-foreground"><th className="p-2 text-start">{t("patheer")}</th><th className="p-2">{t("madeConfirmed")}</th><th className="p-2">{t("loadedFromHim")}</th></tr></thead>
              <tbody>
                {byPatheer.map((r) => (
                  <tr key={r.p.id} className="border-t"><td className="p-2">{r.p.name}</td><td className="num p-2 text-center">{fmt(r.made)}</td><td className="num p-2 text-center">{fmt(r.loaded)}</td></tr>
                ))}
                {unattributed > 0 && <tr className="border-t text-muted-foreground"><td className="p-2">{t("noSource")}</td><td /><td className="num p-2 text-center">{fmt(unattributed)}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <AdjustmentForm />

      <Section title={t("adjustments")}>
        {!(adj.data ?? []).filter((a) => !a.is_opening).length ? <Empty /> : (
          <div className="sheet-wrap">
            <table className="sheet">
              <thead><tr className="text-muted-foreground"><th className="p-2 text-start">{t("date")}</th><th className="p-2 text-start">{t("quality")}</th><th className="p-2">{t("bricks")}</th><th className="p-2 text-start">{t("reason")}</th><th /></tr></thead>
              <tbody>
                {(adj.data ?? []).filter((a) => !a.is_opening).map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="num p-2">{fmtDate(a.entry_date)}</td>
                    <td className="p-2">{a.stock === "raw" ? t("rawBricks") : qName(a.quality_id)}</td>
                    <td className={`num p-2 text-center font-bold ${Number(a.delta) < 0 ? "text-destructive" : "text-success"}`}>{Number(a.delta) > 0 ? "+" : ""}{fmt(Number(a.delta))}</td>
                    <td className="p-2">{a.reason}</td>
                    <td className="no-print p-1"><ConfirmButton size="sm" variant="outline" onConfirm={() => voidAdj(a.id)}>{t("remove")}</ConfirmButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function AdjustmentForm() {
  const { t } = useT();
  const qc = useQueryClient();
  const qualities = useQualities();
  const [f, setF] = useState({ stock: "finished" as "finished" | "raw", quality: "", date: today(), dir: "-1", count: "", reason: "" });
  async function save() {
    const n = parseWhole(f.count);
    if (!n || n <= 0) return void toast.error(t("wholeNumbers"));
    if (f.stock === "finished" && !f.quality) return void toast.error(t("quality"));
    if (!f.reason.trim()) return void toast.error(t("reasonRequired"));
    const { error } = await supabase.from("stock_adjustments").insert({
      stock: f.stock, quality_id: f.stock === "finished" ? f.quality : null, entry_date: f.date, delta: n * Number(f.dir), reason: f.reason.trim(), created_by: await myId(),
    });
    if (error) return void toast.error(error.message);
    toast.success(t("saved"));
    setF({ ...f, count: "", reason: "" });
    qc.invalidateQueries();
  }
  return (
    <Section title={t("newAdjustment")} className="no-print">
      <div className="grid gap-3 md:grid-cols-6">
        <Field label={t("stock")}><Select value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value as "raw" })}>
          <option value="finished">{t("finishedStock")}</option><option value="raw">{t("rawStock")}</option>
        </Select></Field>
        {f.stock === "finished" && <Field label={t("quality")}><Select value={f.quality} onChange={(e) => setF({ ...f, quality: e.target.value })}>
          <option value="">—</option>{(qualities.data ?? []).filter((q) => q.kind === "nakasi").map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}
        </Select></Field>}
        <Field label={t("type")}><Select value={f.dir} onChange={(e) => setF({ ...f, dir: e.target.value })}>
          <option value="-1">− {t("reduce")}</option><option value="1">+ {t("increase")}</option>
        </Select></Field>
        <Field label={t("bricks")}><NumInput value={f.count} onChange={(v) => setF({ ...f, count: v })} /></Field>
        <Field label={t("date")}><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
        <Field label={t("reason")} className="md:col-span-4"><Input className="h-10" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={t("reasonExample")} required /></Field>
        <div className="flex items-end"><ConfirmButton size="lg" onConfirm={save} disabled={!f.count || !f.reason.trim()} description={t("stockChange")}>{t("save")}</ConfirmButton></div>
      </div>
    </Section>
  );
}
