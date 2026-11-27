"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { amountAtRates, parseWhole, type Rate, type RawType } from "@/lib/kiln-math";
import { errMsg, myId, today, useGairs, useKachaStock, useParties, useQualities, useRates } from "@/lib/data";
import { KachaStore, RAW_TYPES } from "@/components/KachaStore";
import { PATHEER } from "@/lib/features";
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
    enabled: stage === "rehra" && PATHEER,
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
    qc.invalidateQueries({ queryKey: ["gair-check"] });
    qc.invalidateQueries({ queryKey: ["ledgers"] });
  };

  async function insertEntry(p: { party_id: string; count: number; quality_id: string | null; source_party_id?: string | null; entry_date: string; notes?: string | null; raw_type?: RawType; from_store?: boolean; firing_ref?: string | null }) {
    // Week and season are filled in by the database from the date.
    const { error } = await supabase.from("kiln_entries").insert({ stage, created_by: await myId(), ...p });
    if (error) { toast.error(error.message); return false; }
    refresh();
    return true;
  }
  async function updateEntry(id: string, patch: Partial<Pick<Entry, "count" | "deleted_at" | "entry_date" | "quality_id" | "source_party_id" | "notes" | "raw_type" | "from_store" | "firing_ref">>) {
    const { error } = await supabase.from("kiln_entries").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
    qc.invalidateQueries({ queryKey: ["raw-store-stock"] });
  }
  /** Rehra "From" cell: "store" = kacha store, otherwise a patheer id (or blank). */
  const fromValue = (e: Entry) => (e.from_store ? "store" : e.source_party_id ?? "");
  const fromPatch = (v: string) => (v === "store" ? { from_store: true, source_party_id: null } : { from_store: false, source_party_id: v || null });
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
  const sumBy = (f: (e: Entry) => boolean) => entries.filter(f).reduce((s, e) => s + Number(e.count), 0);
  const loadedBricks = sumBy((e) => e.raw_type !== "9t");
  const loaded9t = sumBy((e) => e.raw_type === "9t");
  const loadedStore = sumBy((e) => e.from_store);
  const kacha = useKachaStock();
  const storeLeft = (rt: RawType) => Number((kacha.data ?? []).find((k) => k.raw_type === rt)?.balance ?? 0);


  const activeWorkers = rows.filter((w) => w.is_active);
  const qualityOpts = (qualities.data ?? []).filter((q) => q.is_active && (stage === "rehra" || q.kind === "nakasi"));
  // Patheer is switched off for now: rehra loads are just "fresh" or "from the kacha store".
  const patheerOpts = PATHEER ? (patheers.data ?? []).filter((p) => p.is_active) : [];
  const kharchaRows = totals.map(({ w, bricks, earn, kh, hasRate }) => ({ id: w.id, name: w.name, bricks, earn, suggested: kh, noRate: !hasRate }));
  const sorted = entries.slice().sort((x, y) => x.entry_date.localeCompare(y.entry_date) || x.created_at.localeCompare(y.created_at));
  const entryCols = stage === "rehra" ? 8 : 6;
  const gairs = useGairs();
  const lastGair = sorted.slice().reverse().find((e) => e.firing_ref)?.firing_ref ?? (gairs.data ?? []).find((g) => g.gair)?.gair ?? "";

  return (
    <div className="space-y-3">
      <PageHeader title={t(stage === "rehra" ? "rehraKhatta" : "nakasiKhatta")} sub={t(stage === "rehra" ? "rehraHelp" : "nakasiHelp")}
        actions={<>
          <Link href="/gair" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("gairCheck")}</Link>
          <Link href={`/people/${stage}`} className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("workersAndLedgers")}</Link>
        </>} />
      <WeekPicker nav={nav} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {stage === "rehra" ? (<>
          <Stat label={t("bricksLoaded")} value={loadedBricks} sub={loaded9t ? `+ ${fmt(loaded9t)} ${t("raw9t")}` : undefined} />
          <Stat label={t("tilesLoaded")} value={loaded9t} />
          <Stat label={t("loadedFromStore")} value={loadedStore} sub={`${fmt(weekBricks - loadedStore)} ${t(PATHEER ? "freshLoaded" : "freshKacha").toLowerCase()}`} />
          {PATHEER && <Stat label={t("madeMinusLoaded")} value={made - (weekBricks - loadedStore)} sub={`${fmt(made)} ${t("madeThisWeek").toLowerCase()}`} tone={made - (weekBricks - loadedStore) < 0 ? "bad" : undefined} />}
        </>) : <Stat label={t("bakedThisWeek")} value={weekBricks} />}
        <Stat label={t("earnings")} value={weekEarn} money />
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
                {stage === "rehra" ? <><th className="w-28">{t("firingRef")}</th><th className="w-28">{t("rawType")}</th><th>{t("fromCol")}</th></> : <th>{t("quality")}</th>}
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
                  {stage === "rehra" ? (<>
                    <td className="c"><Cell value={e.firing_ref ?? ""} list="gair-list" placeholder="—" disabled={readOnly} bad={!e.firing_ref}
                      onCommit={(v) => updateEntry(e.id, { firing_ref: v.trim() || null })} /></td>
                    <td className="c">
                      <select className="cell" value={e.raw_type} disabled={readOnly} onChange={(ev) => updateEntry(e.id, { raw_type: ev.target.value })} aria-label={t("rawType")}>
                        {RAW_TYPES.map(({ v, k }) => <option key={v} value={v}>{t(k)}</option>)}
                      </select>
                    </td>
                    <td className="c">
                      <FromSelect value={fromValue(e)} patheers={patheerOpts} extra={e.source_party_id} pName={pName} disabled={readOnly} onChange={(v) => updateEntry(e.id, fromPatch(v))} />
                    </td>
                  </>) : (
                    <td className="c">
                      <select className="cell" value={e.quality_id ?? ""} disabled={readOnly} onChange={(ev) => updateEntry(e.id, { quality_id: ev.target.value || null })}>
                        {qualityOpts.map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}
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
                <KilnNewRow stage={stage} n={sorted.length + 1} workers={activeWorkers} qualities={qualityOpts} patheers={patheerOpts} defaultDate={sorted.at(-1)?.entry_date ?? defaultDate} storeLeft={storeLeft} lastGair={lastGair}
                  onAdd={async (p) => { const ok = await insertEntry(p); if (ok && (p.entry_date < start || p.entry_date > end)) { nav.go(p.entry_date); toast.success(`${t("saved")} — ${fmtDate(p.entry_date)}`); } return ok; }} />
              )}
              <tr className="total">
                <td className="rn" /><td colSpan={stage === "rehra" ? 5 : 3}>{t("total")}</td>
                <td className="n num">{stage === "rehra" ? <>{fmt(loadedBricks)}{loaded9t ? <div className="text-[11px] font-normal">+ {fmt(loaded9t)} {t("raw9t")}</div> : null}</> : fmt(weekBricks)}</td><td colSpan={2} />
              </tr>
            </tbody>
          </Sheet>
        </div>
      )}

      <datalist id="gair-list">{(gairs.data ?? []).filter((g) => g.gair).map((g) => <option key={g.gair_key} value={g.gair!} />)}</datalist>
      {stage === "rehra" && <KachaStore start={start} end={end} readOnly={readOnly} patheers={patheers.data ?? []} defaultDate={defaultDate} />}

      <KharchaSheet rows={kharchaRows} readOnly={readOnly} onGive={giveKharcha} />
    </div>
  );
}

type NewKiln = { party_id: string; count: number; quality_id: string | null; source_party_id: string | null; entry_date: string; notes: string | null; raw_type?: RawType; from_store?: boolean; firing_ref?: string | null };

/** Rehra "From": a patheer (fresh dry bricks) or the kacha store. */
function FromSelect({ value, patheers, extra, pName, disabled, onChange }: {
  value: string; patheers: Tables<"parties">[]; extra?: string | null; pName: (id: string | null) => string; disabled?: boolean; onChange: (v: string) => void;
}) {
  const { t } = useT();
  return (
    <select className="cell" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={t("fromCol")}>
      <option value="">{PATHEER ? "—" : t("freshKacha")}</option>
      <option value="store">📦 {t("fromStore")}</option>
      {extra && !patheers.some((p) => p.id === extra) && <option value={extra}>{pName(extra)}</option>}
      {patheers.length > 0 && <optgroup label={t("srcPatheer")}>{patheers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
    </select>
  );
}

/** Blank row at the bottom of the entries sheet: any worker, any date. */
function KilnNewRow({ stage, n, workers, qualities, patheers, defaultDate, storeLeft, lastGair, onAdd }: {
  stage: "rehra" | "nakasi"; n: number; workers: Tables<"parties">[]; qualities: Tables<"qualities">[]; patheers: Tables<"parties">[];
  defaultDate: string; storeLeft: (rt: RawType) => number; lastGair: string; onAdd: (p: NewKiln) => Promise<boolean>;
}) {
  const { t } = useT();
  const [f, setF] = useState({ date: "", party: "", quality: "", source: "", count: "", note: "", rawType: "brick" as RawType, gair: "" });
  const gair = f.gair || lastGair;
  const qty = parseWhole(f.count) ?? 0;
  const overStore = stage === "rehra" && f.source === "store" && qty > storeLeft(f.rawType);
  const date = f.date || defaultDate;
  const quality = f.quality || (stage === "nakasi" ? qualities[0]?.id ?? "" : "");
  async function save() {
    const count = parseWhole(f.count);
    if (!f.party) return void toast.error(t("chooseWorker"));
    if (!count || count <= 0) return void toast.error(t("wholeNumbers"));
    const rehra = stage === "rehra"
      ? { raw_type: f.rawType, from_store: f.source === "store", source_party_id: f.source && f.source !== "store" ? f.source : null, quality_id: null, firing_ref: gair.trim() || null }
      : { source_party_id: null, quality_id: quality || null };
    if (await onAdd({ party_id: f.party, count, entry_date: date, notes: f.note.trim() || null, ...rehra })) {
      setF({ ...f, count: "", note: "", gair });
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
      {stage === "rehra" ? (<>
        <td className="c"><select className="cell" value={f.rawType} onChange={(e) => setF({ ...f, rawType: e.target.value as RawType })} aria-label={t("rawType")}>
          {RAW_TYPES.map(({ v, k }) => <option key={v} value={v}>{t(k)}</option>)}
        </select></td>
        <td className="c"><input className="cell" list="gair-list" placeholder={t("firingExample")} value={gair} onChange={(e) => setF({ ...f, gair: e.target.value })} aria-label={t("firingRef")} /></td>
        <td className="c"><FromSelect value={f.source} patheers={patheers} pName={() => "—"} onChange={(v) => setF({ ...f, source: v })} /></td>
      </>) : (
        <td className="c"><select className="cell" value={quality} onChange={(e) => setF({ ...f, quality: e.target.value })}>
          {qualities.map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}
        </select></td>
      )}
      <td className={`c ${overStore ? "warn" : ""}`}><input className={`cell n num ${overStore ? "bad" : ""}`} inputMode="numeric" placeholder="0" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} onKeyDown={enter} aria-label={t("bricks")}
        title={overStore ? `${t("moreThanInStore")}: ${fmt(storeLeft(f.rawType))}` : undefined} /></td>
      <td className="c"><input className="cell" placeholder={t("note")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onKeyDown={enter} /></td>
      <td className="px-1"><Button size="sm" className="h-7" disabled={!f.count || !f.party} onClick={save}>{t("add")}</Button></td>
    </tr>
  );
}
