import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, useT } from "@/lib/i18n";
import { amountFor, rateOn, suggestedKharcha, weekDays, type Rate } from "@/lib/kiln-math";
import { myId, today, useOwners, usePatheers, useRates, useSeasons, useWeeks } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ConfirmButton";

export const Route = createFileRoute("/_authenticated/weekly")({
  head: () => ({ meta: [{ title: "Weekly register — Mian Nawaz Bricks" }, { name: "description", content: "Patheer weekly entry grid." }] }),
  component: Weekly,
});

type Entry = { id?: string; estimated_count: number; confirmed_count: number | null };
type Job = { pid: string; date: string; field: "estimated_count" | "confirmed_count"; value: number | null };

function Weekly() {
  const { t, days } = useT();
  const qc = useQueryClient();
  const seasons = useSeasons();
  const [seasonId, setSeasonId] = useState<string>();
  const season = (seasons.data ?? []).find((s) => s.id === seasonId);
  useEffect(() => {
    if (!seasonId && seasons.data?.length) setSeasonId((seasons.data.find((s) => !s.is_closed) ?? seasons.data[0]!).id);
  }, [seasons.data, seasonId]);
  const weeks = useWeeks(seasonId);
  const [weekId, setWeekId] = useState<string>();
  useEffect(() => {
    if (!weeks.data?.length) return;
    if (weekId && weeks.data.some((w) => w.id === weekId)) return;
    const d = today();
    setWeekId((weeks.data.find((w) => w.start_date <= d && w.end_date >= d) ?? weeks.data[weeks.data.length - 1]!).id);
  }, [weeks.data, weekId]);
  const week = (weeks.data ?? []).find((w) => w.id === weekId);
  const dates = week ? weekDays(week.start_date) : [];

  const patheers = usePatheers();
  const ratesQ = useRates();
  const owners = useOwners();
  const entriesQ = useQuery({
    queryKey: ["entries", weekId],
    enabled: !!weekId,
    queryFn: async () => {
      const { data, error } = await supabase.from("production_entries").select("*").eq("week_id", weekId!).is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [local, setLocal] = useState<Record<string, Entry>>({});
  useEffect(() => {
    const m: Record<string, Entry> = {};
    for (const e of entriesQ.data ?? []) m[`${e.party_id}|${e.entry_date}`] = { id: e.id, estimated_count: Number(e.estimated_count), confirmed_count: e.confirmed_count == null ? null : Number(e.confirmed_count) };
    setLocal(m);
  }, [entriesQ.data]);

  // Save queue with retry for weak internet
  const queue = useRef<Job[]>([]);
  const [status, setStatus] = useState<"ok" | "saving" | "failed">("ok");
  const localRef = useRef(local);
  localRef.current = local;

  async function runQueue() {
    if (!week || !seasonId) return;
    setStatus("saving");
    while (queue.current.length) {
      const job = queue.current[0]!;
      const key = `${job.pid}|${job.date}`;
      try {
        const uid = await myId();
        const cur = localRef.current[key];
        if (cur?.id) {
          const { error } = await supabase.from("production_entries").update(job.field === "estimated_count" ? { estimated_count: job.value ?? 0, updated_by: uid } : { confirmed_count: job.value, updated_by: uid }).eq("id", cur.id);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.from("production_entries").insert({
            party_id: job.pid, season_id: seasonId, week_id: week.id, entry_date: job.date,
            estimated_count: job.field === "estimated_count" ? job.value ?? 0 : cur?.estimated_count ?? 0,
            confirmed_count: job.field === "confirmed_count" ? job.value : cur?.confirmed_count ?? null, created_by: uid,
          }).select("id").single();
          if (error) throw error;
          setLocal((l) => ({ ...l, [key]: { ...(l[key] ?? { estimated_count: 0, confirmed_count: null }), id: data.id } }));
          localRef.current = { ...localRef.current, [key]: { ...(localRef.current[key] ?? { estimated_count: 0, confirmed_count: null }), id: data.id } };
        }
        queue.current.shift();
      } catch (err) {
        const msg = (err as Error).message;
        setStatus("failed");
        if (/closed|outside/i.test(msg)) { toast.error(msg); queue.current.shift(); continue; }
        return; // retry later
      }
    }
    setStatus("ok");
    qc.invalidateQueries({ queryKey: ["ledgers"] });
  }
  useEffect(() => {
    const iv = setInterval(() => { if (queue.current.length) runQueue(); }, 8000);
    const on = () => runQueue();
    window.addEventListener("online", on);
    return () => { clearInterval(iv); window.removeEventListener("online", on); };
  });

  function setCell(pid: string, date: string, field: Job["field"], raw: string) {
    const key = `${pid}|${date}`;
    const value = raw === "" ? (field === "confirmed_count" ? null : 0) : parseInt(raw, 10);
    const cur = local[key] ?? { estimated_count: 0, confirmed_count: null };
    if (cur[field] === value) return;
    setLocal((l) => ({ ...l, [key]: { ...cur, [field]: value } }));
    queue.current.push({ pid, date, field, value });
    runQueue();
  }

  const rates = useMemo(() => (ratesQ.data ?? []).map((r) => ({ ...r, rate_per_1000: Number(r.rate_per_1000) })), [ratesQ.data]);
  const ratesFor = (pid: string) => rates.filter((r) => r.party_id === pid) as unknown as Rate[];
  const rows = (patheers.data ?? []).filter((p) => p.is_active);

  async function giveKharcha(pid: string, amount: number, handler: string) {
    if (!handler) return void toast.error(t("paidBy"));
    const { error } = await supabase.from("transactions").insert({
      entry_date: today(), season_id: seasonId ?? null, week_id: weekId ?? null, party_id: pid, kind: "kharcha", direction: "out", amount,
      method: "cash", handler_user_id: handler, category: "patheer_kharcha", created_by: await myId(),
    });
    if (error) return void toast.error(error.message);
    toast.success(`${t("kharcha")} ${fmt(amount)}`);
    qc.invalidateQueries();
  }

  if (seasons.data && !seasons.data.length) return <div className="p-10 text-center text-xl">{t("noSeason")}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="h-12 rounded-md border bg-card px-3 text-lg" value={seasonId ?? ""} onChange={(e) => { setSeasonId(e.target.value); setWeekId(undefined); }}>
          {(seasons.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="num h-12 rounded-md border bg-card px-3 text-lg" value={weekId ?? ""} onChange={(e) => setWeekId(e.target.value)}>
          {(weeks.data ?? []).map((w) => <option key={w.id} value={w.id}>#{w.week_number} {w.start_date} → {w.end_date}</option>)}
        </select>
        <span className={status === "failed" ? "text-destructive" : "text-muted-foreground"}>
          {status === "ok" ? t("allSaved") : status === "saving" ? t("saving") : t("unsaved")}
        </span>
        {season?.is_closed && <span className="rounded bg-destructive px-2 text-destructive-foreground">{t("closed")}</span>}
      </div>
      <p className="text-sm text-muted-foreground">↑ {t("estimated")} &nbsp; ↓ {t("confirmed")}</p>

      <div className="register-paper overflow-x-auto rounded-xl border-2 border-primary/30">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-secondary">
            <tr>
              <th className="sticky start-0 z-10 bg-secondary p-2 text-start text-base">{t("patheer")}</th>
              {dates.map((d, i) => <th key={d} className="p-2 text-base">{days[i]}<div className="num text-xs font-normal">{d.slice(5)}</div></th>)}
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
              return (
                <tr key={p.id} className="border-t align-top">
                  <td className="sticky start-0 z-10 bg-card p-2 text-base font-bold">{p.name}</td>
                  {es.map((e) => {
                    const pending = e.estimated_count > 0 && e.confirmed_count == null;
                    const diff = e.confirmed_count != null && e.confirmed_count !== e.estimated_count;
                    const r = rateOn(pr, "earning", e.entry_date);
                    return (
                      <td key={e.entry_date} className={`p-1 ${pending ? "bg-warning/20" : ""}`}>
                        <Input key={`e${p.id}${e.entry_date}${e.estimated_count}`} disabled={season?.is_closed} className="num h-10 w-24 text-center text-base" inputMode="numeric" defaultValue={e.estimated_count || ""}
                          onBlur={(ev) => setCell(p.id, e.entry_date, "estimated_count", ev.target.value.replace(/\D/g, ""))} />
                        <Input key={`c${p.id}${e.entry_date}${e.confirmed_count}`} disabled={season?.is_closed} className={`num mt-1 h-10 w-24 text-center text-base font-semibold ${diff ? "border-destructive text-destructive" : ""}`} inputMode="numeric" defaultValue={e.confirmed_count ?? ""}
                          onBlur={(ev) => setCell(p.id, e.entry_date, "confirmed_count", ev.target.value.replace(/\D/g, ""))} />
                        <div className="num text-center text-xs text-muted-foreground">
                          {pending ? t("pending") : e.confirmed_count != null && r != null ? fmt(amountFor(e.confirmed_count, r)) : ""}
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
                    <KharchaCell amount={kh} owners={owners.data ?? []} disabled={!!season?.is_closed || kh <= 0} onGive={(a, h) => giveKharcha(p.id, a, h)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KharchaCell({ amount, owners, disabled, onGive }: { amount: number; owners: { id: string; display_name: string }[]; disabled: boolean; onGive: (a: number, h: string) => void }) {
  const { t } = useT();
  const [val, setVal] = useState("");
  const [h, setH] = useState("");
  const a = val ? parseInt(val, 10) : amount;
  return (
    <div className="space-y-1">
      <Input className="num h-10 w-28 text-center" inputMode="numeric" placeholder={fmt(amount)} value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, ""))} />
      <select className="h-9 w-28 rounded border bg-background text-xs" value={h} onChange={(e) => setH(e.target.value)}>
        <option value="">{t("paidBy")}</option>
        {owners.map((o) => <option key={o.id} value={o.id}>{o.display_name}</option>)}
      </select>
      <ConfirmButton size="sm" disabled={disabled && !val} onConfirm={() => onGive(a, h)}>{t("giveKharcha")}</ConfirmButton>
    </div>
  );
}
