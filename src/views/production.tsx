"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, fmtMonth, useT } from "@/lib/i18n";
import { addDays, monthEnd, monthStart, parseWhole, summarize } from "@/lib/kiln-math";
import { fetchAll, gairName, myId, openGairFor, today, useBrickTypes, useGairList, useParties, useQualities } from "@/lib/data";
import { GairBar, GairSelect } from "@/components/GairBar";
import { downloadExcel } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Empty, PageHeader, Stat } from "@/components/kit";
import { Cell, LetterRow, Sheet } from "@/components/sheet";

type Entry = Tables<"kiln_entries">;

/** Production Register — bricks out of the kiln after each firing. Every row adds to that brick type's stock. */
export default function ProductionPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const types = useBrickTypes();
  const gairs = useGairList().data ?? [];
  const allQualities = useQualities();
  const workers = useParties("nakasi");
  const [month, setMonth] = useState(monthStart(today()));
  const [allTime, setAllTime] = useState(false);
  const from = allTime ? "1900-01-01" : month;
  const to = allTime ? "2999-12-31" : monthEnd(month);
  const q = useQuery({
    queryKey: ["production", from, to],
    queryFn: () => fetchAll<Entry>((a, b) => supabase.from("kiln_entries").select("*").eq("stage", "nakasi").is("deleted_at", null)
      .gte("entry_date", from).lte("entry_date", to).order("entry_date").order("created_at").range(a, b)),
  });
  const rows = q.data ?? [];
  const typeName = (id: string | null) => (allQualities.data ?? []).find((x) => x.id === id)?.name_en ?? "—";
  const total = rows.reduce((s, r) => s + Number(r.count), 0);
  const byFiring = useMemo(() => summarize(rows.map((r) => ({ ...r, quantity: Number(r.count), amount: 0 })), (r) => r.firing_ref || t("noFiringRef")), [rows, t]);
  const byType = useMemo(() => summarize(rows.map((r) => ({ ...r, quantity: Number(r.count), amount: 0 })), (r) => typeName(r.quality_id)), [rows, allQualities.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => qc.invalidateQueries();

  async function update(id: string, patch: Partial<Entry>) {
    const { error } = await supabase.from("kiln_entries").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }

  return (
    <div className="space-y-3">
      <PageHeader title={t("productionRegister")} sub={t("productionHelp")} actions={<>
        <Link href="/stock" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("stockSummary")} →</Link>
        <Button variant="outline" size="sm" onClick={() => downloadExcel(`production-${allTime ? "all" : month.slice(0, 7)}`, [
          { name: "Production", rows: [["Date", "Firing", "Brick type", "Quantity", "Worker", "Notes"], ...rows.map((r) => [r.entry_date, r.firing_ref ?? "", typeName(r.quality_id), Number(r.count), (workers.data ?? []).find((w) => w.id === r.party_id)?.name ?? "", r.notes ?? ""])] },
          { name: "By firing", rows: [["Firing", "Entries", "Quantity"], ...byFiring.map((g) => [g.key, g.count, g.quantity])] },
          { name: "By brick type", rows: [["Brick type", "Entries", "Quantity"], ...byType.map((g) => [g.key, g.count, g.quantity])] },
        ])}>Excel</Button>
      </>} />
      <GairBar />

      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border bg-card">
          <button className="h-9 px-3 text-lg disabled:opacity-40" disabled={allTime} onClick={() => setMonth(monthStart(addDays(month, -1)))} aria-label="previous month">‹</button>
          <span className="min-w-24 text-center text-sm font-semibold">{allTime ? t("allTime") : fmtMonth(month)}</span>
          <button className="h-9 px-3 text-lg disabled:opacity-40" disabled={allTime} onClick={() => setMonth(monthStart(addDays(monthEnd(month), 1)))} aria-label="next month">›</button>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={allTime} onCheckedChange={setAllTime} />{t("allTime")}</label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("bricksProduced")} value={total} />
        <Stat label={t("firings")} value={byFiring.length} />
        <Stat label={t("entries")} value={rows.length} />
      </div>

      <Sheet minWidth={860}>
        <thead>
          <LetterRow cols={7} />
          <tr><th className="rn">#</th><th className="w-36">{t("date")}</th><th className="w-40">{t("firingRef")}</th><th className="w-40">{t("brickType")}</th>
            <th className="n w-32">{t("quantityProduced")}</th><th className="w-40">{t("nakasiWorker")}</th><th>{t("note")}</th><th className="no-print w-10" /></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={i > 0 && rows[i - 1]!.entry_date !== r.entry_date ? "day-start" : ""}>
              <td className="rn">{i + 1}</td>
              <td className="c"><Cell type="date" value={r.entry_date} dim={i > 0 && rows[i - 1]!.entry_date === r.entry_date} onCommit={(v) => v && update(r.id, { entry_date: v })} /></td>
              <td className="c"><GairSelect value={r.gair_id ?? ""} gairs={gairs} bad={!r.gair_id} onChange={(v) => update(r.id, { gair_id: v || null })} /></td>
              <td className="c"><select className="cell" value={r.quality_id ?? ""} onChange={(e) => update(r.id, { quality_id: e.target.value })}>
                {!(types.data ?? []).some((x) => x.id === r.quality_id) && <option value={r.quality_id ?? ""}>{typeName(r.quality_id)}</option>}
                {(types.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name_en}</option>)}
              </select></td>
              <td className="c"><Cell numeric className="font-semibold" value={String(Number(r.count))} onCommit={(v) => { const n = parseWhole(v); if (n && n > 0) update(r.id, { count: n }); }} /></td>
              <td className="c"><select className="cell" value={r.party_id ?? ""} onChange={(e) => update(r.id, { party_id: e.target.value || null })}>
                <option value="">—</option>{(workers.data ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></td>
              <td className="c"><Cell value={r.notes ?? ""} placeholder="—" onCommit={(v) => update(r.id, { notes: v.trim() || null })} /></td>
              <td className="no-print px-1"><ConfirmButton size="sm" variant="outline" description={t("stockChange")} onConfirm={() => update(r.id, { deleted_at: new Date().toISOString() })}>×</ConfirmButton></td>
            </tr>
          ))}
          <NewProductionRow n={rows.length + 1} types={types.data ?? []} workers={(workers.data ?? []).filter((w) => w.is_active)} last={rows.at(-1)} gairs={gairs} onSaved={refresh} />
          <tr className="total"><td className="rn" /><td colSpan={3}>{t("total")}</td><td className="n num">{fmt(total)}</td><td colSpan={3} /></tr>
        </tbody>
      </Sheet>
      {!q.isLoading && !rows.length && <Empty>{t("productionEmpty")}</Empty>}

      <div className="grid gap-3 md:grid-cols-2">
        <Summary title={t("byFiring")} rows={byFiring} />
        <Summary title={t("byBrickType")} rows={byType} />
      </div>
    </div>
  );
}

function Summary({ title, rows }: { title: string; rows: { key: string; quantity: number; count: number }[] }) {
  const { t } = useT();
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold">{title}</div>
      <Sheet>
        <thead><tr><th>{title}</th><th className="n w-20">{t("entries")}</th><th className="n w-32">{t("bricksCol")}</th></tr></thead>
        <tbody>
          {rows.map((g) => <tr key={g.key}><td>{g.key}</td><td className="n num">{g.count}</td><td className="n num font-semibold">{fmt(g.quantity)}</td></tr>)}
          <tr className="total"><td>{t("total")}</td><td className="n num">{rows.reduce((s, g) => s + g.count, 0)}</td><td className="n num">{fmt(rows.reduce((s, g) => s + g.quantity, 0))}</td></tr>
        </tbody>
      </Sheet>
    </div>
  );
}

function NewProductionRow({ n, types, workers, last, gairs, onSaved }: {
  n: number; types: Tables<"qualities">[]; workers: Tables<"parties">[]; last: Entry | undefined; gairs: Tables<"gairs">[]; onSaved: () => void;
}) {
  const { t } = useT();
  const [f, setF] = useState({ date: "", gair: "", type: "", qty: "", worker: "", note: "" });
  const [busy, setBusy] = useState(false);
  const date = f.date || last?.entry_date || today();
  // Blank = the open gair the database picks (nakasi → oldest open gair).
  const autoGair = openGairFor(gairs, "nakasi", date);
  async function save() {
    const qty = parseWhole(f.qty);
    if (!f.type) return void toast.error(t("brickType"));
    if (!qty || qty <= 0) return void toast.error(t("wholeNumbers"));
    setBusy(true);
    const { error } = await supabase.from("kiln_entries").insert({
      stage: "nakasi", entry_date: date, gair_id: f.gair || null, quality_id: f.type, count: qty, party_id: f.worker || null,
      notes: f.note.trim() || null, created_by: await myId(),
    });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(`${t("saved")} — ${fmt(qty)} ${t("bricks")}`);
    setF({ ...f, type: "", qty: "", note: "", date });
    onSaved();
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && f.qty && f.type) { e.preventDefault(); save(); } };
  return (
    <tr className="new no-print">
      <td className="rn">{n}</td>
      <td className="c"><input className="cell" type="date" value={date} onChange={(e) => setF({ ...f, date: e.target.value })} /></td>
      <td className="c"><GairSelect value={f.gair} gairs={gairs} auto={autoGair ? `🔥 ${gairName(autoGair)} (${t("autoShort")})` : "—"} onChange={(v) => setF({ ...f, gair: v })} /></td>
      <td className="c"><select className="cell" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label={t("brickType")}>
        <option value="">{t("brickType")}…</option>{types.map((x) => <option key={x.id} value={x.id}>{x.name_en}</option>)}
      </select></td>
      <td className="c"><input className="cell n num font-semibold" inputMode="numeric" placeholder="0" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} onKeyDown={enter} aria-label={t("quantityProduced")} /></td>
      <td className="c"><select className="cell" value={f.worker} onChange={(e) => setF({ ...f, worker: e.target.value })}>
        <option value="">— {t("optional")}</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select></td>
      <td className="c"><input className="cell" placeholder={t("note")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onKeyDown={enter} /></td>
      <td className="px-1"><Button size="sm" className="h-7" disabled={busy || !f.qty || !f.type} onClick={save}>{t("add")}</Button></td>
    </tr>
  );
}
