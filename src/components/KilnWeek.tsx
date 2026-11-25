"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { amountAtRates, parseWhole, type Rate } from "@/lib/kiln-math";
import { errMsg, myId, today, useParties, useQualities, useRates } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { KharchaSheet } from "@/components/KharchaSheet";
import { Cell, LetterRow, Sheet } from "@/components/sheet";
import { clampDate, Empty, PageHeader, Stat, WeekPicker, useWeekNav } from "@/components/kit";

type Stage = "rehra" | "nakasi";
type Entry = Tables<"kiln_entries">;

export function KilnWeek({ stage }: { stage: Stage }) {
  const { t } = useT();
  const qc = useQueryClient();
  const nav = useWeekNav();
  const { start, end, readOnly } = nav;
  const workers = useParties(stage);
  const patheers = useParties("patheer");
  const qualities = useQualities();
  const ratesQ = useRates();
  const entriesQ = useQuery({
    queryKey: ["kiln", stage, start],
    queryFn: async () => {
      const { data, error } = await supabase.from("kiln_entries").select("*").eq("stage", stage).gte("entry_date", start).lte("entry_date", end).is("deleted_at", null).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  // Patheer confirmed this week, for rehra reconciliation.
  const madeQ = useQuery({
    queryKey: ["entries", start, "made"],
    enabled: stage === "rehra",
    queryFn: async () => {
      const { data, error } = await supabase.from("production_entries").select("party_id, confirmed_count").gte("entry_date", start).lte("entry_date", end).is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const qName = (id: string | null) => {
    const q = (qualities.data ?? []).find((x) => x.id === id);
    return q ? q.name_en : "—";
  };
  const pName = (id: string | null) => [...(workers.data ?? []), ...(patheers.data ?? [])].find((p) => p.id === id)?.name ?? "—";
  const cols = (qualities.data ?? []).filter((q) => q.kind === "nakasi" && q.is_active);
  const entries = entriesQ.data ?? [];
  const rows = (workers.data ?? []).filter((w) => w.is_active || entries.some((e) => e.party_id === w.id));
  const rates = useMemo(() => (ratesQ.data ?? []).map((r) => ({ ...r, rate_per_1000: Number(r.rate_per_1000) })), [ratesQ.data]);
  const ratesFor = (pid: string) => rates.filter((r) => r.party_id === pid) as unknown as Rate[];
  const [cellDate, setCellDate] = useState("");
  const defaultDate = cellDate && cellDate >= start && cellDate <= end ? cellDate : clampDate(today(), start, end);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["kiln", stage] });
    qc.invalidateQueries({ queryKey: ["ledgers"] });
  };

  async function insertEntry(p: { party_id: string; count: number; quality_id: string | null; source_party_id?: string | null; entry_date: string; notes?: string | null }) {
    // Week and season are filled in by the database from the date.
    const { error } = await supabase.from("kiln_entries").insert({ stage, created_by: await myId(), ...p });
    if (error) { toast.error(error.message); return false; }
    refresh();
    return true;
  }
  async function updateEntry(id: string, patch: Partial<Pick<Entry, "count" | "deleted_at" | "entry_date" | "quality_id" | "source_party_id" | "notes">>) {
    const { error } = await supabase.from("kiln_entries").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }
  /** Nakasi grid cell: one entry per worker × quality per week (blank or 0 voids it). */
  async function setCell(pid: string, qid: string, raw: string, existing: Entry[]) {
    const v = parseWhole(raw) ?? 0;
    if (existing.length > 1) return;
    const cur = existing[0];
    if (!cur && v > 0) await insertEntry({ party_id: pid, quality_id: qid, count: v, entry_date: defaultDate });
    else if (cur && v > 0 && v !== Number(cur.count)) await updateEntry(cur.id, { count: v });
    else if (cur && v === 0) await updateEntry(cur.id, { deleted_at: new Date().toISOString() });
  }
  async function giveKharcha(pid: string, amount: number, handler: string, date: string) {
    if (!handler) { toast.error(t("paidBy")); return false; }
    try {
      const { error } = await supabase.from("transactions").insert({
        entry_date: date, party_id: pid, kind: "kharcha", direction: "out", amount,
        method: "cash", handler_user_id: handler, category: `${stage}_kharcha`, created_by: await myId(),
      });
      if (error) throw error;
      toast.success(`${t("kharcha")} ${fmt(amount)}`);
      qc.invalidateQueries();
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    }
  }

  const totals = rows.map((w) => {
    const es = entries.filter((e) => e.party_id === w.id);
    const items = es.map((e) => ({ date: e.entry_date, count: Number(e.count) }));
    const pr = ratesFor(w.id);
    return { w, es, bricks: items.reduce((s, i) => s + i.count, 0), earn: amountAtRates(items, pr, "earning"), kh: amountAtRates(items, pr, "kharcha"), hasRate: pr.some((r) => r.kind === "earning") };
  });
  const weekBricks = totals.reduce((s, r) => s + r.bricks, 0);
  const weekEarn = totals.reduce((s, r) => s + r.earn, 0);
  const made = (madeQ.data ?? []).reduce((s, e) => s + Number(e.confirmed_count ?? 0), 0);


  const activeWorkers = rows.filter((w) => w.is_active);
  const qualityOpts = (qualities.data ?? []).filter((q) => q.is_active && (stage === "rehra" || q.kind === "nakasi"));
  const patheerOpts = (patheers.data ?? []).filter((p) => p.is_active);
  const kharchaRows = totals.map(({ w, bricks, earn, kh, hasRate }) => ({ id: w.id, name: w.name, bricks, earn, suggested: kh, noRate: !hasRate }));
  const sorted = entries.slice().sort((x, y) => x.entry_date.localeCompare(y.entry_date) || x.created_at.localeCompare(y.created_at));
  const entryCols = stage === "rehra" ? 7 : 6;

  return (
    <div className="space-y-3">
      <PageHeader title={t(stage === "rehra" ? "rehraKhatta" : "nakasiKhatta")} sub={t(stage === "rehra" ? "rehraHelp" : "nakasiHelp")}
        actions={<Link href={`/people/${stage}`} className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("workersAndLedgers")}</Link>} />
      <WeekPicker nav={nav} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label={t(stage === "rehra" ? "loadedThisWeek" : "bakedThisWeek")} value={weekBricks} />
        <Stat label={t("earnings")} value={weekEarn} money />
        {stage === "rehra" && <Stat label={t("madeThisWeek")} value={made} />}
        {stage === "rehra" && <Stat label={t("madeMinusLoaded")} value={made - weekBricks} tone={made - weekBricks < 0 ? "bad" : undefined} />}
      </div>

      {!rows.length && <Empty>{t("addWorkersFirst")} — <Link href={`/people/${stage}`} className="text-primary underline">{t(stage)}</Link></Empty>}

      {stage === "nakasi" && rows.length > 0 && (
        <div className="space-y-1">
          <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {t("dateForNewEntries")}
            <input type="date" className="h-8 rounded-md border bg-card px-2 text-foreground" min={start} max={end} value={defaultDate} onChange={(e) => setCellDate(e.target.value)} />
          </label>
          <Sheet minWidth={160 + cols.length * 90 + 240} className="max-w-4xl">
            <thead>
              <LetterRow cols={cols.length + 3} />
              <tr>
                <th className="rn">#</th><th>{t("nakasi")}</th>
                {cols.map((q) => <th key={q.id} className="n">{q.name_en}</th>)}
                <th className="n w-28">{t("total")}</th><th className="n w-28">Rs</th>
              </tr>
            </thead>
            <tbody>
              {totals.map(({ w, es, bricks, earn, hasRate }, i) => (
                <tr key={w.id}>
                  <td className="rn">{i + 1}</td>
                  <td className="whitespace-nowrap font-medium"><Link href={`/party/${w.id}`} className="hover:underline">{w.name}</Link>{!hasRate && <span className="ms-1 text-[11px] text-destructive">{t("missingRate")}</span>}</td>
                  {cols.map((q) => {
                    const cell = es.filter((e) => e.quality_id === q.id);
                    const sum = cell.reduce((s, e) => s + Number(e.count), 0);
                    return (
                      <td key={q.id} className="c w-[5.5rem]" title={cell.length > 1 ? t("multipleEntries") : undefined}>
                        <Cell numeric value={sum ? String(sum) : ""} disabled={readOnly || cell.length > 1} label={`${w.name} ${q.name_en}`}
                          onCommit={(v) => setCell(w.id, q.id, v, cell)} />
                      </td>
                    );
                  })}
                  <td className="n num font-semibold">{fmt(bricks)}</td>
                  <td className="n num font-semibold text-primary">{fmt(earn)}</td>
                </tr>
              ))}
              <tr className="total">
                <td className="rn" /><td>{t("total")}</td>
                {cols.map((q) => <td key={q.id} className="n num">{fmt(entries.filter((e) => e.quality_id === q.id).reduce((s, e) => s + Number(e.count), 0))}</td>)}
                <td className="n num">{fmt(weekBricks)}</td><td className="n num">{fmt(weekEarn)}</td>
              </tr>
            </tbody>
          </Sheet>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-1">
          <div className="text-sm font-semibold">{t(stage === "rehra" ? "loadsSheet" : "entries")}</div>
          <Sheet minWidth={stage === "rehra" ? 860 : 700}>
            <thead>
              <LetterRow cols={entryCols} />
              <tr>
                <th className="rn">#</th><th className="w-36">{t("date")}</th><th>{t(stage)}</th>
                <th>{t("quality")}</th>{stage === "rehra" && <th>{t("sourcePatheer")}</th>}
                <th className="n w-28">{t("bricksCol")}</th><th>{t("note")}</th><th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((e, i) => (
                <tr key={e.id} className={i > 0 && sorted[i - 1]!.entry_date !== e.entry_date ? "day-start" : ""}>
                  <td className="rn">{i + 1}</td>
                  <td className="c"><Cell type="date" value={e.entry_date} disabled={readOnly} dim={i > 0 && sorted[i - 1]!.entry_date === e.entry_date}
                    onCommit={(v) => { if (v) { updateEntry(e.id, { entry_date: v }); if (v < start || v > end) nav.go(v); } }} /></td>
                  <td className="whitespace-nowrap">{pName(e.party_id)}</td>
                  <td className="c">
                    <select className="cell" value={e.quality_id ?? ""} disabled={readOnly} onChange={(ev) => updateEntry(e.id, { quality_id: ev.target.value || null })}>
                      {stage === "rehra" && <option value="">—</option>}
                      {qualityOpts.map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}
                    </select>
                  </td>
                  {stage === "rehra" && (
                    <td className="c">
                      <select className="cell" value={e.source_party_id ?? ""} disabled={readOnly} onChange={(ev) => updateEntry(e.id, { source_party_id: ev.target.value || null })}>
                        <option value="">—</option>{patheerOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </td>
                  )}
                  <td className="c"><Cell numeric value={String(Number(e.count))} disabled={readOnly}
                    onCommit={(v) => { const n = parseWhole(v); if (n && n > 0) updateEntry(e.id, { count: n }); }} /></td>
                  <td className="c"><Cell value={e.notes ?? ""} placeholder="—" disabled={readOnly} onCommit={(v) => updateEntry(e.id, { notes: v.trim() || null })} /></td>
                  <td className="px-1">{!readOnly && <ConfirmButton size="sm" variant="outline" onConfirm={() => updateEntry(e.id, { deleted_at: new Date().toISOString() })}>×</ConfirmButton>}</td>
                </tr>
              ))}
              {!readOnly && (
                <KilnNewRow stage={stage} n={sorted.length + 1} workers={activeWorkers} qualities={qualityOpts} patheers={patheerOpts} defaultDate={sorted.at(-1)?.entry_date ?? defaultDate}
                  onAdd={async (p) => { const ok = await insertEntry(p); if (ok && (p.entry_date < start || p.entry_date > end)) { nav.go(p.entry_date); toast.success(`${t("saved")} — ${fmtDate(p.entry_date)}`); } return ok; }} />
              )}
              <tr className="total">
                <td className="rn" /><td colSpan={stage === "rehra" ? 4 : 3}>{t("total")}</td>
                <td className="n num">{fmt(weekBricks)}</td><td colSpan={2} />
              </tr>
            </tbody>
          </Sheet>
        </div>
      )}

      <KharchaSheet rows={kharchaRows} readOnly={readOnly} onGive={giveKharcha} />
    </div>
  );
}

type NewKiln = { party_id: string; count: number; quality_id: string | null; source_party_id: string | null; entry_date: string; notes: string | null };

/** Blank row at the bottom of the entries sheet: any worker, any date. */
function KilnNewRow({ stage, n, workers, qualities, patheers, defaultDate, onAdd }: {
  stage: "rehra" | "nakasi"; n: number; workers: Tables<"parties">[]; qualities: Tables<"qualities">[]; patheers: Tables<"parties">[];
  defaultDate: string; onAdd: (p: NewKiln) => Promise<boolean>;
}) {
  const { t } = useT();
  const [f, setF] = useState({ date: "", party: "", quality: "", source: "", count: "", note: "" });
  const date = f.date || defaultDate;
  const quality = f.quality || (stage === "nakasi" ? qualities[0]?.id ?? "" : "");
  async function save() {
    const count = parseWhole(f.count);
    if (!f.party) return void toast.error(t("chooseWorker"));
    if (!count || count <= 0) return void toast.error(t("wholeNumbers"));
    if (await onAdd({ party_id: f.party, count, quality_id: quality || null, source_party_id: f.source || null, entry_date: date, notes: f.note.trim() || null })) {
      setF({ ...f, count: "", note: "" });
    }
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && f.count) { e.preventDefault(); save(); } };
  return (
    <tr className="new">
      <td className="rn">{n}</td>
      <td className="c"><input className="cell" type="date" value={date} onChange={(e) => setF({ ...f, date: e.target.value })} /></td>
      <td className="c"><select className="cell" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} aria-label={t(stage)}>
        <option value="">{t("chooseWorker")}</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select></td>
      <td className="c"><select className="cell" value={quality} onChange={(e) => setF({ ...f, quality: e.target.value })}>
        {stage === "rehra" && <option value="">—</option>}{qualities.map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}
      </select></td>
      {stage === "rehra" && <td className="c"><select className="cell" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
        <option value="">—</option>{patheers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></td>}
      <td className="c"><input className="cell n num" inputMode="numeric" placeholder="0" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} onKeyDown={enter} aria-label={t("bricks")} /></td>
      <td className="c"><input className="cell" placeholder={t("note")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onKeyDown={enter} /></td>
      <td className="px-1"><Button size="sm" className="h-7" disabled={!f.count || !f.party} onClick={save}>{t("add")}</Button></td>
    </tr>
  );
}
