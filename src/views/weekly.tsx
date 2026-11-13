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
import { KharchaCell } from "@/components/KharchaCell";
import { Empty, PageHeader, SeasonWeekPicker, useSeasonWeek } from "@/components/kit";

type Entry = { id?: string; estimated_count: number; confirmed_count: number | null };
type Field = "estimated_count" | "confirmed_count";
type Job = { pid: string; date: string; field: Field; value: number | null; weekId: string; seasonId: string };

const QUEUE_KEY = "mnb-weekly-queue";
const loadQueue = (): Job[] => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as Job[]; } catch { return []; }
};
const saveQueue = (q: Job[]) => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage unavailable */ }
};
/** Errors that will never succeed on retry. */
const PERMANENT = /season is closed|outside the selected week|permission denied|violates/i;

export default function Weekly() {
  const { t, days } = useT();
  const qc = useQueryClient();
  const sw = useSeasonWeek();
  const { week, weekId, seasonId, readOnly } = sw;
  const dates = week ? weekDays(week.start_date) : [];
  const patheers = usePatheers();
  const ratesQ = useRates();
  const entriesQ = useQuery({
    queryKey: ["entries", weekId],
    enabled: !!weekId,
    queryFn: async () => {
      const { data, error } = await supabase.from("production_entries").select("*").eq("week_id", weekId!).is("deleted_at", null);
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
            const { error } = await supabase.from("production_entries").insert({
              party_id: job.pid, season_id: job.seasonId, week_id: job.weekId, entry_date: job.date,
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
    for (const e of entriesQ.data ?? []) m[`${e.party_id}|${e.entry_date}`] = { id: e.id, estimated_count: Number(e.estimated_count), confirmed_count: e.confirmed_count == null ? null : Number(e.confirmed_count) };
    for (const j of queue.current) {
      if (j.weekId !== weekId) continue;
      const k = `${j.pid}|${j.date}`;
      m[k] = { ...(m[k] ?? { estimated_count: 0, confirmed_count: null }), [j.field]: j.field === "estimated_count" ? j.value ?? 0 : j.value };
    }
    setLocal(m);
  }, [entriesQ.data, weekId]);

  function setCell(pid: string, date: string, field: Field, raw: string) {
    if (!week || !seasonId) return;
    const key = `${pid}|${date}`;
    const s = normalizeDigits(raw);
    const value = s === "" ? (field === "confirmed_count" ? null : 0) : Number(s);
    const cur = local[key] ?? { estimated_count: 0, confirmed_count: null };
    if (cur[field] === value) return;
    setLocal((l) => ({ ...l, [key]: { ...cur, [field]: value } }));
    queue.current.push({ pid, date, field, value, weekId: week.id, seasonId });
    sync();
    runQueue();
  }

  const rates = useMemo(() => (ratesQ.data ?? []).map((r) => ({ ...r, rate_per_1000: Number(r.rate_per_1000) })), [ratesQ.data]);
  const ratesFor = (pid: string) => rates.filter((r) => r.party_id === pid) as unknown as Rate[];
  const rows = (patheers.data ?? []).filter((p) => p.is_active || (entriesQ.data ?? []).some((e) => e.party_id === p.id));

  async function giveKharcha(pid: string, amount: number, handler: string) {
    if (!handler) { toast.error(t("paidBy")); return false; }
    try {
      const { error } = await supabase.from("transactions").insert({
        entry_date: today(), season_id: seasonId ?? null, week_id: weekId ?? null, party_id: pid, kind: "kharcha", direction: "out", amount,
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

  if (sw.seasons.data && !sw.seasons.data.length) return <Empty>{t("noSeason")}</Empty>;

  const dayTotals = dates.map((d) => rows.reduce((acc, p) => {
    const e = local[`${p.id}|${d}`];
    return { est: acc.est + (e?.estimated_count ?? 0), conf: acc.conf + (e?.confirmed_count ?? 0) };
  }, { est: 0, conf: 0 }));

  return (
    <div className="space-y-4">
      <PageHeader title={t("weekly")} sub={t("weeklyHelp")} />
      <div className="flex flex-wrap items-center gap-3">
        <SeasonWeekPicker sw={sw} />
        <span className={status === "failed" ? "font-bold text-destructive" : "text-muted-foreground"}>
          {status === "ok" && !pending ? t("allSaved") : status === "failed" ? `${t("unsaved")} (${fmt(pending)})` : t("saving")}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">↑ {t("estimated")} &nbsp; ↓ {t("confirmed")} &nbsp; <span className="rounded bg-warning/30 px-1">{t("pending")}</span> &nbsp; <span className="text-destructive">{t("diff")}</span></p>

      <div className="register-paper overflow-x-auto rounded-xl border-2 border-primary/30">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-secondary">
            <tr>
              <th className="sticky start-0 z-10 bg-secondary p-2 text-start text-base">{t("patheer")}</th>
              {dates.map((d, i) => <th key={d} className="p-2 text-base">{days[i]}<div className="num text-xs font-normal">{fmtDate(d).slice(0, 5)}</div></th>)}
              <th className="p-2 text-base">{t("mizanKham")}</th>
              <th className="p-2 text-base">{t("kharcha")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const pr = ratesFor(p.id);
              const es = dates.map((d) => ({ entry_date: d, ...(local[`${p.id}|${d}`] ?? { estimated_count: 0, confirmed_count: null }) }));
              const totEst = es.reduce((s, e) => s + e.estimated_count, 0);
              const totConf = es.reduce((s, e) => s + (e.confirmed_count ?? 0), 0);
              const earn = es.reduce((s, e) => { const r = rateOn(pr, "earning", e.entry_date); return s + (e.confirmed_count != null && r != null ? amountFor(e.confirmed_count, r) : 0); }, 0);
              const kh = suggestedKharcha(es, pr);
              const noRate = !pr.some((r) => r.kind === "earning");
              return (
                <tr key={p.id} className="border-t align-top">
                  <td className="sticky start-0 z-10 bg-card p-2 text-base font-bold">
                    <Link href={`/party/${p.id}`} className="hover:underline">{p.name}</Link>
                    {noRate && <div className="text-xs font-normal text-destructive">{t("missingRate")}</div>}
                  </td>
                  {es.map((e) => {
                    const isPending = e.estimated_count > 0 && e.confirmed_count == null;
                    const diff = e.confirmed_count != null && e.confirmed_count !== e.estimated_count;
                    const r = rateOn(pr, "earning", e.entry_date);
                    return (
                      <td key={e.entry_date} className={`p-1 ${isPending ? "bg-warning/20" : ""}`}>
                        <Input key={`e${p.id}${e.entry_date}${e.estimated_count}`} disabled={readOnly} className="num h-10 w-24 text-center text-base" inputMode="numeric" defaultValue={e.estimated_count || ""}
                          aria-label={`${p.name} ${e.entry_date} ${t("estimated")}`}
                          onBlur={(ev) => setCell(p.id, e.entry_date, "estimated_count", ev.target.value)} />
                        <Input key={`c${p.id}${e.entry_date}${e.confirmed_count}`} disabled={readOnly} className={`num mt-1 h-10 w-24 text-center text-base font-semibold ${diff ? "border-destructive text-destructive" : ""}`} inputMode="numeric" defaultValue={e.confirmed_count ?? ""}
                          aria-label={`${p.name} ${e.entry_date} ${t("confirmed")}`}
                          onBlur={(ev) => setCell(p.id, e.entry_date, "confirmed_count", ev.target.value)} />
                        <div className="num text-center text-xs text-muted-foreground">
                          {isPending ? t("pending") : e.confirmed_count != null && r != null ? fmt(amountFor(e.confirmed_count, r)) : ""}
                          {diff && <div className="text-destructive">{e.confirmed_count! - e.estimated_count > 0 ? "+" : ""}{fmt(e.confirmed_count! - e.estimated_count)}</div>}
                        </div>
                      </td>
                    );
                  })}
                  <td className="p-2 text-center">
                    <div className="num text-muted-foreground">{fmt(totEst)}</div>
                    <div className="num font-bold">{fmt(totConf)}</div>
                    <div className="num font-bold text-primary">Rs {fmt(earn)}</div>
                  </td>
                  <td className="p-2 text-center">
                    <KharchaCell amount={kh} disabled={readOnly || kh <= 0} onGive={(a, h) => giveKharcha(p.id, a, h)} />
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-primary bg-secondary/50 font-bold">
              <td className="sticky start-0 bg-secondary p-2">{t("total")}</td>
              {dayTotals.map((d, i) => <td key={i} className="p-2 text-center"><div className="num text-muted-foreground">{fmt(d.est)}</div><div className="num">{fmt(d.conf)}</div></td>)}
              <td className="p-2 text-center"><div className="num text-muted-foreground">{fmt(dayTotals.reduce((s, d) => s + d.est, 0))}</div><div className="num">{fmt(dayTotals.reduce((s, d) => s + d.conf, 0))}</div></td>
              <td />
            </tr>
          </tbody>
        </table>
        {!rows.length && <div className="p-4"><Empty>{t("addWorkersFirst")}</Empty></div>}
      </div>
    </div>
  );
}
