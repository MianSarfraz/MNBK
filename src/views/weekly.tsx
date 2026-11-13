"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { amountFor, normalizeDigits, rateOn, suggestedKharcha, weekDays, type Rate } from "@/lib/kiln-math";
import { errMsg, myId, today, usePatheers, useRates } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KharchaCell } from "@/components/KharchaCell";
import { DateInput, Empty, Field, NumInput, PageHeader, Select, WeekPicker, useWeekNav } from "@/components/kit";

type Entry = { estimated_count: number; confirmed_count: number | null };
type Col = "estimated_count" | "confirmed_count";
type Job = { pid: string; date: string; field: Col; value: number | null };

const QUEUE_KEY = "mnb-weekly-queue";
const loadQueue = (): Job[] => {
  try { return (JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as Job[]).filter((j) => j && j.pid && j.date && j.field); } catch { return []; }
};
const saveQueue = (q: Job[]) => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage unavailable */ }
};
/** Errors that will never succeed on retry. */
const PERMANENT = /season is closed|outside the selected week|permission denied|violates|not allowed/i;
const key = (pid: string, date: string) => `${pid}|${date}`;

export default function Weekly() {
  const { t, days } = useT();
  const qc = useQueryClient();
  const nav = useWeekNav();
  const { start, end, readOnly } = nav;
  const dates = weekDays(start);
  const patheers = usePatheers();
  const ratesQ = useRates();
  const entriesQ = useQuery({
    queryKey: ["entries", start],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_entries").select("*").gte("entry_date", start).lte("entry_date", end).is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---- Save queue: persisted on the device, one runner at a time, retried on reconnect ----
  const queue = useRef<Job[]>([]);
  const running = useRef(false);
  const [pending, setPending] = useState(0);
  const [status, setStatus] = useState<"ok" | "saving" | "failed">("ok");
  const [local, setLocal] = useState<Record<string, Entry>>({});
  const sync = () => { saveQueue(queue.current); setPending(queue.current.length); };

  const runQueue = useCallback(async () => {
    if (running.current || !queue.current.length) return;
    running.current = true;
    setStatus("saving");
    try {
      while (queue.current.length) {
        const job = queue.current[0]!;
        try {
          const uid = await myId();
          const { data: existing, error: e0 } = await supabase.from("production_entries").select("id").eq("party_id", job.pid).eq("entry_date", job.date).maybeSingle();
          if (e0) throw e0;
          if (existing) {
            const patch = job.field === "estimated_count" ? { estimated_count: job.value ?? 0 } : { confirmed_count: job.value };
            const { error } = await supabase.from("production_entries").update({ ...patch, deleted_at: null, updated_by: uid }).eq("id", existing.id);
            if (error) throw error;
          } else {
            // Week and season are filled in by the database from the date.
            const { error } = await supabase.from("production_entries").insert({
              party_id: job.pid, entry_date: job.date,
              estimated_count: job.field === "estimated_count" ? job.value ?? 0 : 0,
              confirmed_count: job.field === "confirmed_count" ? job.value : null, created_by: uid,
            });
            if (error) throw error;
          }
          queue.current.shift();
          sync();
        } catch (err) {
          const msg = errMsg(err);
          if (PERMANENT.test(msg)) { toast.error(msg); queue.current.shift(); sync(); continue; }
          setStatus("failed");
          return; // network trouble: keep the job and retry later
        }
      }
      setStatus("ok");
      qc.invalidateQueries({ queryKey: ["entries"] });
      qc.invalidateQueries({ queryKey: ["ledgers"] });
    } finally {
      running.current = false;
    }
  }, [qc]);

  useEffect(() => {
    queue.current = loadQueue();
    setPending(queue.current.length);
    runQueue();
    const iv = setInterval(() => { if (queue.current.length) runQueue(); }, 8000);
    const on = () => runQueue();
    window.addEventListener("online", on);
    return () => { clearInterval(iv); window.removeEventListener("online", on); };
  }, [runQueue]);

  // Server values, overlaid with anything still waiting in the queue so a refresh never hides unsaved typing.
  useEffect(() => {
    const m: Record<string, Entry> = {};
    for (const e of entriesQ.data ?? []) m[key(e.party_id, e.entry_date)] = { estimated_count: Number(e.estimated_count), confirmed_count: e.confirmed_count == null ? null : Number(e.confirmed_count) };
    for (const j of queue.current) {
      if (j.date < start || j.date > end) continue;
      const k = key(j.pid, j.date);
      m[k] = { ...(m[k] ?? { estimated_count: 0, confirmed_count: null }), [j.field]: j.field === "estimated_count" ? j.value ?? 0 : j.value };
    }
    setLocal(m);
  }, [entriesQ.data, start, end]);

  function setCell(pid: string, date: string, field: Col, raw: string) {
    const k = key(pid, date);
    const s = normalizeDigits(raw);
    const value = s === "" ? (field === "confirmed_count" ? null : 0) : Number(s);
    const cur = local[k] ?? { estimated_count: 0, confirmed_count: null };
    if (cur[field] === value) return;
    setLocal((l) => ({ ...l, [k]: { ...cur, [field]: value } }));
    queue.current.push({ pid, date, field, value });
    sync();
    runQueue();
  }

  const rates = useMemo(() => (ratesQ.data ?? []).map((r) => ({ ...r, rate_per_1000: Number(r.rate_per_1000) })), [ratesQ.data]);
  const ratesFor = (pid: string) => rates.filter((r) => r.party_id === pid) as unknown as Rate[];
  const rows = (patheers.data ?? []).filter((p) => p.is_active || (entriesQ.data ?? []).some((e) => e.party_id === p.id));
  const entryOf = (pid: string, d: string): Entry => local[key(pid, d)] ?? { estimated_count: 0, confirmed_count: null };

  async function giveKharcha(pid: string, amount: number, handler: string, date: string) {
    if (!handler) { toast.error(t("paidBy")); return false; }
    try {
      const { error } = await supabase.from("transactions").insert({
        entry_date: date, party_id: pid, kind: "kharcha", direction: "out", amount,
        method: "cash", handler_user_id: handler, category: "patheer_kharcha", created_by: await myId(),
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

  // Phones start on the day view; wide screens on the full week grid.
  const [view, setView] = useState<"day" | "week">("week");
  const [day, setDay] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(max-width: 767px)").matches) setView("day");
  }, []);
  useEffect(() => {
    const i = dates.indexOf(today());
    setDay(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const totals = (pid: string) => {
    const pr = ratesFor(pid);
    const es = dates.map((d) => ({ entry_date: d, ...entryOf(pid, d) }));
    return {
      est: es.reduce((s, e) => s + e.estimated_count, 0),
      conf: es.reduce((s, e) => s + (e.confirmed_count ?? 0), 0),
      earn: es.reduce((s, e) => { const r = rateOn(pr, "earning", e.entry_date); return s + (e.confirmed_count != null && r != null ? amountFor(e.confirmed_count, r) : 0); }, 0),
      kh: suggestedKharcha(es, pr),
      noRate: !pr.some((r) => r.kind === "earning"),
    };
  };

  const statusText = status === "ok" && !pending ? `✓ ${t("allSaved")}` : status === "failed" ? `${t("unsaved")} (${fmt(pending)})` : t("saving");

  return (
    <div className="space-y-3">
      <PageHeader title={t("weekly")} sub={t("weeklyHelp")} />
      <div className="flex flex-wrap items-center gap-2">
        <WeekPicker nav={nav} />
        <span className={`text-sm ${status === "failed" ? "font-semibold text-destructive" : "text-muted-foreground"}`}>{statusText}</span>
      </div>

      <QuickEntry patheers={(patheers.data ?? []).filter((p) => p.is_active)} disabled={readOnly}
        onSave={(pid, date, est, conf) => {
          if (est != null) setCellRaw(pid, date, "estimated_count", est);
          if (conf !== undefined) setCellRaw(pid, date, "confirmed_count", conf);
          if (date < start || date > end) nav.go(date);
          toast.success(`${t("saved")} — ${fmtDate(date)}`);
        }} />

      <div className="flex items-center gap-1 text-sm">
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {(["day", "week"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 ${view === v ? "bg-primary text-primary-foreground" : ""}`}>{t(v === "day" ? "dayView" : "weekView")}</button>
          ))}
        </div>
        <span className="ms-2 text-xs text-muted-foreground"><span className="rounded bg-warning/30 px-1">{t("pending")}</span> <span className="text-destructive">{t("diff")}</span></span>
      </div>

      {!rows.length && <Empty>{t("addWorkersFirst")} — <Link href="/patheer" className="text-primary underline">{t("patheer")}</Link></Empty>}

      {rows.length > 0 && view === "day" && (
        <>
          <div className="grid grid-cols-7 gap-1">
            {dates.map((d, i) => (
              <button key={d} onClick={() => setDay(i)}
                className={`rounded-lg border py-1.5 text-center text-xs ${i === day ? "border-primary bg-primary text-primary-foreground" : "bg-card"} ${d === today() && i !== day ? "border-primary" : ""}`}>
                <div className="font-semibold">{days[i]}</div><div className="num">{d.slice(8)}</div>
              </button>
            ))}
          </div>
          <div className="divide-y rounded-xl border bg-card">
            <div className="grid grid-cols-[1fr_5.5rem_5.5rem] gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>{fmtDate(dates[day])}</span><span className="text-center">{t("estimated")}</span><span className="text-center">{t("confirmed")}</span>
            </div>
            {rows.map((p) => {
              const d = dates[day]!;
              const e = entryOf(p.id, d);
              const isPending = e.estimated_count > 0 && e.confirmed_count == null;
              const diff = e.confirmed_count != null && e.confirmed_count !== e.estimated_count;
              const r = rateOn(ratesFor(p.id), "earning", d);
              return (
                <div key={p.id} className={`grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-2 px-3 py-2 ${isPending ? "bg-warning/15" : ""}`}>
                  <div className="min-w-0">
                    <Link href={`/party/${p.id}`} className="block truncate font-medium">{p.name}</Link>
                    <div className="num text-xs text-muted-foreground">{e.confirmed_count != null && r != null ? `Rs ${fmt(amountFor(e.confirmed_count, r))}` : isPending ? t("pending") : ""}</div>
                  </div>
                  <Input key={`e${p.id}${d}${e.estimated_count}`} disabled={readOnly} className="num h-10 text-center" inputMode="numeric" defaultValue={e.estimated_count || ""}
                    aria-label={`${p.name} ${t("estimated")}`} onBlur={(ev) => setCell(p.id, d, "estimated_count", ev.target.value)} />
                  <Input key={`c${p.id}${d}${e.confirmed_count}`} disabled={readOnly} className={`num h-10 text-center font-semibold ${diff ? "border-destructive text-destructive" : ""}`} inputMode="numeric" defaultValue={e.confirmed_count ?? ""}
                    aria-label={`${p.name} ${t("confirmed")}`} onBlur={(ev) => setCell(p.id, d, "confirmed_count", ev.target.value)} />
                </div>
              );
            })}
          </div>
          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">{t("weekTotalsKharcha")}</summary>
            <div className="divide-y">
              {rows.map((p) => {
                const tt = totals(p.id);
                return (
                  <div key={p.id} className="flex items-start justify-between gap-2 px-3 py-2">
                    <div className="text-sm">
                      <div className="font-medium">{p.name}</div>
                      <div className="num text-xs text-muted-foreground">{t("estimated")} {fmt(tt.est)} · {t("confirmed")} {fmt(tt.conf)}</div>
                      <div className="num font-semibold text-primary">Rs {fmt(tt.earn)}</div>
                      {tt.noRate && <div className="text-xs text-destructive">{t("missingRate")}</div>}
                    </div>
                    <KharchaCell amount={tt.kh} disabled={readOnly || tt.kh <= 0} onGive={(a, h, date) => giveKharcha(p.id, a, h, date)} />
                  </div>
                );
              })}
            </div>
          </details>
        </>
      )}

      {rows.length > 0 && view === "week" && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-secondary">
              <tr>
                <th className="sticky start-0 z-10 bg-secondary p-2 text-start">{t("patheer")}</th>
                {dates.map((d, i) => <th key={d} className={`p-1.5 ${d === today() ? "text-primary" : ""}`}>{days[i]}<div className="num text-[11px] font-normal">{d.slice(8)}/{d.slice(5, 7)}</div></th>)}
                <th className="p-2">{t("mizanKham")}</th>
                <th className="p-2">{t("kharcha")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const pr = ratesFor(p.id);
                const tt = totals(p.id);
                return (
                  <tr key={p.id} className="border-t align-top">
                    <td className="sticky start-0 z-10 bg-card p-2 font-semibold">
                      <Link href={`/party/${p.id}`} className="hover:underline">{p.name}</Link>
                      {tt.noRate && <div className="text-xs font-normal text-destructive">{t("missingRate")}</div>}
                    </td>
                    {dates.map((d) => {
                      const e = entryOf(p.id, d);
                      const isPending = e.estimated_count > 0 && e.confirmed_count == null;
                      const diff = e.confirmed_count != null && e.confirmed_count !== e.estimated_count;
                      const r = rateOn(pr, "earning", d);
                      return (
                        <td key={d} className={`p-1 ${isPending ? "bg-warning/20" : ""}`}>
                          <Input key={`e${p.id}${d}${e.estimated_count}`} disabled={readOnly} className="num h-9 w-20 px-1 text-center" inputMode="numeric" defaultValue={e.estimated_count || ""}
                            aria-label={`${p.name} ${d} ${t("estimated")}`} onBlur={(ev) => setCell(p.id, d, "estimated_count", ev.target.value)} />
                          <Input key={`c${p.id}${d}${e.confirmed_count}`} disabled={readOnly} className={`num mt-1 h-9 w-20 px-1 text-center font-semibold ${diff ? "border-destructive text-destructive" : ""}`} inputMode="numeric" defaultValue={e.confirmed_count ?? ""}
                            aria-label={`${p.name} ${d} ${t("confirmed")}`} onBlur={(ev) => setCell(p.id, d, "confirmed_count", ev.target.value)} />
                          <div className="num text-center text-[11px] text-muted-foreground">
                            {isPending ? t("pending") : e.confirmed_count != null && r != null ? fmt(amountFor(e.confirmed_count, r)) : ""}
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-2 text-center">
                      <div className="num text-muted-foreground">{fmt(tt.est)}</div>
                      <div className="num font-bold">{fmt(tt.conf)}</div>
                      <div className="num font-bold text-primary">Rs {fmt(tt.earn)}</div>
                    </td>
                    <td className="p-2"><KharchaCell amount={tt.kh} disabled={readOnly || tt.kh <= 0} onGive={(a, h, date) => giveKharcha(p.id, a, h, date)} /></td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-primary bg-secondary/50 font-semibold">
                <td className="sticky start-0 bg-secondary p-2">{t("total")}</td>
                {dates.map((d) => {
                  const s = rows.reduce((a, p) => { const e = entryOf(p.id, d); return { est: a.est + e.estimated_count, conf: a.conf + (e.confirmed_count ?? 0) }; }, { est: 0, conf: 0 });
                  return <td key={d} className="p-1 text-center"><div className="num text-muted-foreground">{fmt(s.est)}</div><div className="num">{fmt(s.conf)}</div></td>;
                })}
                <td className="p-2 text-center num">{fmt(rows.reduce((a, p) => a + totals(p.id).conf, 0))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  function setCellRaw(pid: string, date: string, field: Col, value: number | null) {
    queue.current.push({ pid, date, field, value });
    if (date >= start && date <= end) setLocal((l) => ({ ...l, [key(pid, date)]: { ...(l[key(pid, date)] ?? { estimated_count: 0, confirmed_count: null }), [field]: field === "estimated_count" ? value ?? 0 : value } }));
    sync();
    runQueue();
  }
}

/** Add or correct one patheer's count on any date (week is worked out automatically). */
function QuickEntry({ patheers, disabled, onSave }: {
  patheers: { id: string; name: string }[]; disabled: boolean;
  onSave: (pid: string, date: string, est: number | null, conf: number | null | undefined) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ pid: "", date: today(), est: "", conf: "" });
  if (!open) return <Button variant="outline" size="sm" onClick={() => setOpen(true)}>+ {t("addEntryAnyDate")}</Button>;
  return (
    <form className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!f.pid) return void toast.error(t("chooseWorker"));
        if (!f.est && !f.conf) return void toast.error(t("wholeNumbers"));
        onSave(f.pid, f.date, f.est ? Number(f.est) : null, f.conf ? Number(f.conf) : undefined);
        setF({ ...f, est: "", conf: "" });
      }}>
      <Field label={t("patheer")} className="col-span-2 sm:col-span-1">
        <Select value={f.pid} onChange={(e) => setF({ ...f, pid: e.target.value })} disabled={disabled}>
          <option value="">—</option>{patheers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
      </Field>
      <Field label={t("date")} className="col-span-2 sm:col-span-1"><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
      <Field label={t("estimated")}><NumInput value={f.est} onChange={(v) => setF({ ...f, est: v })} disabled={disabled} /></Field>
      <Field label={t("confirmed")}><NumInput value={f.conf} onChange={(v) => setF({ ...f, conf: v })} disabled={disabled} /></Field>
      <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
        <Button type="submit" className="h-10 flex-1" disabled={disabled}>{t("save")}</Button>
        <Button type="button" variant="ghost" className="h-10" onClick={() => setOpen(false)}>×</Button>
      </div>
    </form>
  );
}
