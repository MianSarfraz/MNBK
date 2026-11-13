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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { KharchaCell } from "@/components/KharchaCell";
import { clampDate, DateInput, Empty, Field, NumInput, PageHeader, Section, Select, Stat, WeekPicker, useWeekNav } from "@/components/kit";

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
  async function updateEntry(id: string, patch: { count?: number; deleted_at?: string }) {
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


  return (
    <div className="space-y-4">
      <PageHeader title={t(stage === "rehra" ? "rehraKhatta" : "nakasiKhatta")} sub={t(stage === "rehra" ? "rehraHelp" : "nakasiHelp")}
        actions={<Link href={`/people/${stage}`} className="inline-flex h-10 items-center rounded-md border bg-card px-4">{t("workersAndLedgers")}</Link>} />
      <WeekPicker nav={nav} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t(stage === "rehra" ? "loadedThisWeek" : "bakedThisWeek")} value={weekBricks} />
        <Stat label={t("earnings")} value={weekEarn} money />
        {stage === "rehra" && <Stat label={t("madeThisWeek")} value={made} />}
        {stage === "rehra" && <Stat label={t("madeMinusLoaded")} value={made - weekBricks} tone={made - weekBricks < 0 ? "bad" : undefined} />}
      </div>

      {stage === "nakasi" && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {t("dateForNewEntries")}
          <input type="date" className="h-9 rounded-md border bg-card px-2 text-foreground" min={start} max={end} value={defaultDate} onChange={(e) => setCellDate(e.target.value)} />
        </label>
      )}
      {stage === "nakasi" ? (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-secondary"><tr>
              <th className="sticky start-0 z-10 bg-secondary p-2 text-start text-base">{t("nakasi")}</th>
              {cols.map((q) => <th key={q.id} className="p-2 text-base">{q.name_en}</th>)}
              <th className="p-2 text-base">{t("total")}</th><th className="p-2 text-base">{t("kharcha")}</th>
            </tr></thead>
            <tbody>
              {totals.map(({ w, es, bricks, earn, kh, hasRate }) => (
                <tr key={w.id} className="border-t align-top">
                  <td className="sticky start-0 z-10 bg-card p-2 text-base font-bold"><Link href={`/party/${w.id}`} className="hover:underline">{w.name}</Link></td>
                  {cols.map((q) => {
                    const cell = es.filter((e) => e.quality_id === q.id);
                    const sum = cell.reduce((s, e) => s + Number(e.count), 0);
                    return (
                      <td key={q.id} className="p-1">
                        <Input key={`${w.id}${q.id}${sum}`} disabled={readOnly || cell.length > 1} className="num h-9 w-20 px-1 text-center" inputMode="numeric" defaultValue={sum || ""}
                          title={cell.length > 1 ? t("multipleEntries") : undefined}
                          onBlur={(ev) => setCell(w.id, q.id, ev.target.value, cell)} />
                      </td>
                    );
                  })}
                  <td className="p-2 text-center">
                    <div className="num font-bold">{fmt(bricks)}</div>
                    <div className="num font-bold text-primary">Rs {fmt(earn)}</div>
                    {!hasRate && <div className="text-xs text-destructive">{t("missingRate")}</div>}
                  </td>
                  <td className="p-2 text-center"><KharchaCell amount={kh} disabled={readOnly || kh <= 0} onGive={(a, h, d) => giveKharcha(w.id, a, h, d)} /></td>
                </tr>
              ))}
              <tr className="border-t-2 border-primary bg-secondary/50 font-bold">
                <td className="sticky start-0 bg-secondary p-2">{t("total")}</td>
                {cols.map((q) => <td key={q.id} className="num p-2 text-center">{fmt(entries.filter((e) => e.quality_id === q.id).reduce((s, e) => s + Number(e.count), 0))}</td>)}
                <td className="num p-2 text-center">{fmt(weekBricks)}</td><td />
              </tr>
            </tbody>
          </table>
          {!rows.length && <div className="p-4"><Empty>{t("addWorkersFirst")}</Empty></div>}
        </div>
      ) : (
        <>
          <RehraForm workers={rows.filter((w) => w.is_active)} patheers={(patheers.data ?? []).filter((p) => p.is_active)} qualities={(qualities.data ?? []).filter((q) => q.is_active)}
            defaultDate={defaultDate} disabled={readOnly}
            onAdd={async (p) => { const ok = await insertEntry(p); if (ok && (p.entry_date < start || p.entry_date > end)) { nav.go(p.entry_date); toast.success(`${t("saved")} — ${fmtDate(p.entry_date)}`); } return ok; }} />
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary"><tr>
                <th className="p-2 text-start">{t("rehra")}</th><th className="p-2">{t("bricks")}</th><th className="p-2">{t("earnings")}</th><th className="p-2">{t("kharcha")}</th>
              </tr></thead>
              <tbody>
                {totals.map(({ w, bricks, earn, kh, hasRate }) => (
                  <tr key={w.id} className="border-t align-top">
                    <td className="p-2 font-bold"><Link href={`/party/${w.id}`} className="hover:underline">{w.name}</Link></td>
                    <td className="num p-2 text-center">{fmt(bricks)}</td>
                    <td className="num p-2 text-center">Rs {fmt(earn)}{!hasRate && <div className="text-xs text-destructive">{t("missingRate")}</div>}</td>
                    <td className="p-2 text-center"><KharchaCell amount={kh} disabled={readOnly || kh <= 0} onGive={(a, h, d) => giveKharcha(w.id, a, h, d)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <div className="p-4"><Empty>{t("addWorkersFirst")}</Empty></div>}
          </div>
        </>
      )}

      <Section title={t("entries")}>
        {!entries.length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-muted-foreground">
                <th className="p-2 text-start">{t("date")}</th><th className="p-2 text-start">{t("name")}</th><th className="p-2 text-start">{t("quality")}</th>
                {stage === "rehra" && <th className="p-2 text-start">{t("sourcePatheer")}</th>}
                <th className="p-2">{t("bricks")}</th><th className="p-2 text-start">{t("note")}</th><th />
              </tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="num p-2">{fmtDate(e.entry_date)}</td>
                    <td className="p-2">{pName(e.party_id)}</td>
                    <td className="p-2">{qName(e.quality_id)}</td>
                    {stage === "rehra" && <td className="p-2">{pName(e.source_party_id)}</td>}
                    <td className="p-1 text-center">
                      <Input key={`${e.id}${e.count}`} disabled={readOnly} className="num mx-auto h-10 w-28 text-center" inputMode="numeric" defaultValue={Number(e.count)}
                        onBlur={(ev) => { const v = parseWhole(ev.target.value); if (v && v > 0 && v !== Number(e.count)) updateEntry(e.id, { count: v }); }} />
                    </td>
                    <td className="p-2 text-sm text-muted-foreground">{e.notes}</td>
                    <td className="p-1">{!readOnly && <ConfirmButton size="sm" variant="outline" onConfirm={() => updateEntry(e.id, { deleted_at: new Date().toISOString() })}>{t("remove")}</ConfirmButton>}</td>
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

function RehraForm({ workers, patheers, qualities, defaultDate, disabled, onAdd }: {
  workers: Tables<"parties">[]; patheers: Tables<"parties">[]; qualities: Tables<"qualities">[];
  defaultDate: string; disabled: boolean;
  onAdd: (p: { party_id: string; count: number; quality_id: string | null; source_party_id: string | null; entry_date: string; notes: string | null }) => Promise<boolean>;
}) {
  const { t } = useT();
  const [f, setF] = useState({ party: "", count: "", quality: "", source: "", date: "", note: "" });
  const date = f.date || defaultDate;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const count = parseWhole(f.count);
    if (!f.party) return void toast.error(t("chooseWorker"));
    if (!count || count <= 0) return void toast.error(t("wholeNumbers"));
    if (await onAdd({ party_id: f.party, count, quality_id: f.quality || null, source_party_id: f.source || null, entry_date: date, notes: f.note.trim() || null })) {
      setF({ ...f, count: "", note: "" });
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-6">
      <Field label={t("rehra")} className="md:col-span-2"><Select value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })} disabled={disabled}>
        <option value="">—</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </Select></Field>
      <Field label={t("bricksLoaded")}><NumInput value={f.count} onChange={(v) => setF({ ...f, count: v })} disabled={disabled} /></Field>
      <Field label={t("date")}><DateInput value={date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      <Field label={`${t("quality")} (${t("optional")})`}><Select value={f.quality} onChange={(e) => setF({ ...f, quality: e.target.value })} disabled={disabled}>
        <option value="">—</option>{qualities.map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}
      </Select></Field>
      <Field label={`${t("sourcePatheer")} (${t("optional")})`}><Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} disabled={disabled}>
        <option value="">—</option>{patheers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select></Field>
      <Field label={t("note")} className="md:col-span-5"><Input className="h-10" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} disabled={disabled} /></Field>
      <div className="flex items-end"><Button size="lg" className="w-full" disabled={disabled}>{t("add")}</Button></div>
    </form>
  );
}
