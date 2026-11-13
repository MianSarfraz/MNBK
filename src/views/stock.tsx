"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtDate, useT, type Key } from "@/lib/i18n";
import { parseWhole, rawStock } from "@/lib/kiln-math";
import { fetchAll, myId, today, useParties, useQualities, useSeasons } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DateInput, Empty, Field, NumInput, PageHeader, PrintHeader, Section, Select, Stat } from "@/components/kit";

const CAT: Record<string, Key> = { normal: "catNormal", nine_t: "cat9t", special: "catSpecial", other: "catOther" };

export default function StockPage() {
  const { t, lang } = useT();
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
  const cats = ["normal", "nine_t", "special", "other"].filter((c) => finRows.some((r) => r.category === c));
  const unmapped = (qualities.data ?? []).filter((q) => q.kind === "sale" && q.is_active && !q.stock_quality_id);
  const qName = (id: string | null) => { const q = (qualities.data ?? []).find((x) => x.id === id); return q ? (lang === "ur" ? q.name_ur : q.name_en) : t("rawBricks"); };

  async function voidAdj(id: string) {
    const { error } = await supabase.from("stock_adjustments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries();
  }

  return (
    <div className="space-y-5">
      <PrintHeader title={t("stock")} />
      <PageHeader title={t("stock")} actions={<>
        <Button variant="outline" onClick={() => downloadExcel(`stock-${today()}`, [
          { name: "Finished stock", rows: [["Quality", "Category", "Baked out (nakasi)", "Sold", "Adjusted", "In stock"], ...finRows.map((r) => [lang === "ur" ? r.name_ur : r.name_en, r.category, Number(r.produced), Number(r.sold), Number(r.adjusted), Number(r.balance)])] },
          { name: "Raw stock", rows: [["Patheer", "Made (confirmed)", "Loaded (with source)"], ...byPatheer.map((r) => [r.p.name, r.made, r.loaded]), ["(no source)", null, unattributed], [], ["Total", rs.made, rs.loaded], ["Adjusted", rs.adjusted], ["At yard", rs.balance]] },
        ])}>Excel</Button>
        <Button variant="outline" onClick={() => window.print()}>{t("print")} / PDF</Button>
      </>} />

      <Section title={t("finishedStock")}>
        {!finRows.length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead className="bg-secondary"><tr>
                <th className="p-2 text-start">{t("quality")}</th><th className="p-2">{t("bakedOut")}</th><th className="p-2">{t("sold")}</th><th className="p-2">{t("adjusted")}</th><th className="p-2">{t("inStock")}</th>
              </tr></thead>
              <tbody>
                {cats.map((c) => {
                  const rows = finRows.filter((r) => r.category === c);
                  return [
                    <tr key={c} className="bg-muted/50"><td colSpan={5} className="p-1 px-2 text-sm font-bold">{t(CAT[c]!)}</td></tr>,
                    ...rows.map((r) => (
                      <tr key={r.quality_id} className="border-t">
                        <td className="p-2 font-semibold">{lang === "ur" ? r.name_ur : r.name_en}</td>
                        <td className="num p-2 text-center">{fmt(Number(r.produced))}</td>
                        <td className="num p-2 text-center">{fmt(Number(r.sold))}</td>
                        <td className="num p-2 text-center">{fmt(Number(r.adjusted))}</td>
                        <td className={`num p-2 text-center text-xl font-bold ${Number(r.balance) < 0 ? "text-destructive" : "text-primary"}`}>{fmt(Number(r.balance))}</td>
                      </tr>
                    )),
                  ];
                })}
                <tr className="border-t-2 border-primary font-bold"><td className="p-2">{t("total")}</td>
                  {(["produced", "sold", "adjusted", "balance"] as const).map((k) => <td key={k} className="num p-2 text-center">{fmt(finRows.reduce((s, r) => s + Number(r[k]), 0))}</td>)}</tr>
              </tbody>
            </table>
          </div>
        )}
        {unmapped.length > 0 && (
          <p className="mt-3 text-sm text-warning-foreground">⚠ {t("unmappedQualities")}: {unmapped.map((q) => (lang === "ur" ? q.name_ur : q.name_en)).join("، ")} — <Link href="/qualities" className="text-primary underline">{t("qualities")}</Link></p>
        )}
      </Section>

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
            <table className="w-full text-base">
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
        {!(adj.data ?? []).length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead><tr className="text-muted-foreground"><th className="p-2 text-start">{t("date")}</th><th className="p-2 text-start">{t("quality")}</th><th className="p-2">{t("bricks")}</th><th className="p-2 text-start">{t("reason")}</th><th /></tr></thead>
              <tbody>
                {(adj.data ?? []).map((a) => (
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
  const { t, lang } = useT();
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
          <option value="">—</option>{(qualities.data ?? []).filter((q) => q.kind === "nakasi").map((q) => <option key={q.id} value={q.id}>{lang === "ur" ? q.name_ur : q.name_en}</option>)}
        </Select></Field>}
        <Field label={t("type")}><Select value={f.dir} onChange={(e) => setF({ ...f, dir: e.target.value })}>
          <option value="-1">− {t("reduce")}</option><option value="1">+ {t("increase")}</option>
        </Select></Field>
        <Field label={t("bricks")}><NumInput value={f.count} onChange={(v) => setF({ ...f, count: v })} /></Field>
        <Field label={t("date")}><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
        <Field label={t("reason")} className="md:col-span-4"><Input className="h-12" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder={t("reasonExample")} required /></Field>
        <div className="flex items-end"><ConfirmButton size="lg" onConfirm={save} disabled={!f.count || !f.reason.trim()} description={t("stockChange")}>{t("save")}</ConfirmButton></div>
      </div>
    </Section>
  );
}
