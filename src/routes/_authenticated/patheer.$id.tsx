import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, useT } from "@/lib/i18n";
import { amountFor, rateOn, settle, weekStart, type Rate } from "@/lib/kiln-math";
import { myId, today, useOwners } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BalanceBadge } from "@/components/BalanceBadge";

export const Route = createFileRoute("/_authenticated/patheer/$id")({
  head: () => ({ meta: [{ title: "Patheer ledger — Mian Nawaz Bricks" }, { name: "description", content: "Patheer khatta and settlement." }] }),
  component: PatheerLedger,
});

type PayKind = "pay" | "receive" | "deduct" | "kharcha";
const payMap = {
  pay: { kind: "worker_payment_us", direction: "out" },
  receive: { kind: "worker_payment_them", direction: "in" },
  deduct: { kind: "adjustment", direction: "in" },
  kharcha: { kind: "kharcha", direction: "out" },
} as const;

function PatheerLedger() {
  const { id } = Route.useParams();
  const { t } = useT();
  const qc = useQueryClient();
  const owners = useOwners();
  const q = useQuery({
    queryKey: ["patheer-ledger", id],
    queryFn: async () => {
      const [p, r, e, tx] = await Promise.all([
        supabase.from("parties").select("*").eq("id", id).single(),
        supabase.from("party_rates").select("*").eq("party_id", id).is("deleted_at", null).order("effective_from"),
        supabase.from("production_entries").select("*").eq("party_id", id).is("deleted_at", null).order("entry_date"),
        supabase.from("transactions").select("*").eq("party_id", id).is("deleted_at", null).order("entry_date"),
      ]);
      if (p.error) throw p.error;
      return { party: p.data, rates: r.data ?? [], entries: e.data ?? [], txns: tx.data ?? [] };
    },
  });

  const [pay, setPay] = useState({ type: "pay" as PayKind, amount: "", date: today(), handler: "", method: "cash", note: "" });
  const [rate, setRate] = useState({ kind: "earning" as "earning" | "kharcha", value: "", from: today() });

  const view = useMemo(() => {
    if (!q.data) return null;
    const rates = q.data.rates.map((r) => ({ ...r, rate_per_1000: Number(r.rate_per_1000) })) as Rate[];
    // Weekly earnings rows (confirmed only)
    const byWeek = new Map<string, { bricks: number; amount: number; pending: number }>();
    for (const e of q.data.entries) {
      const ws = weekStart(e.entry_date);
      const row = byWeek.get(ws) ?? { bricks: 0, amount: 0, pending: 0 };
      if (e.confirmed_count == null) row.pending++;
      else {
        const r = rateOn(rates, "earning", e.entry_date);
        row.bricks += Number(e.confirmed_count);
        if (r != null) row.amount += amountFor(Number(e.confirmed_count), r);
      }
      byWeek.set(ws, row);
    }
    type Row = { date: string; label: string; plus: number; minus: number; txId?: string; note?: string | null };
    const rows: Row[] = [];
    for (const [ws, w] of byWeek) rows.push({ date: ws, label: `${t("earnings")} — ${fmt(w.bricks)} ${t("bricks")}${w.pending ? ` (${w.pending} ${t("pending")})` : ""}`, plus: w.amount, minus: 0 });
    let kharcha = 0, paidByUs = 0, paidByThem = 0, deductions = 0;
    for (const x of q.data.txns) {
      const a = Number(x.amount);
      if (x.kind === "kharcha") { kharcha += a; rows.push({ date: x.entry_date, label: t("kharcha"), plus: 0, minus: a, txId: x.id, note: x.note }); }
      else if (x.kind === "worker_payment_us") { paidByUs += a; rows.push({ date: x.entry_date, label: t("payHim"), plus: 0, minus: a, txId: x.id, note: x.note }); }
      else if (x.kind === "worker_payment_them") { paidByThem += a; rows.push({ date: x.entry_date, label: t("hePays"), plus: a, minus: 0, txId: x.id, note: x.note }); }
      else if (x.kind === "adjustment") { deductions += a; rows.push({ date: x.entry_date, label: t("deduction"), plus: 0, minus: a, txId: x.id, note: x.note }); }
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const opening = Number(q.data.party.opening_balance);
    let run = opening;
    const withRun = rows.map((r) => ({ ...r, run: (run += r.plus - r.minus) }));
    const earnings = [...byWeek.values()].reduce((s, w) => s + w.amount, 0);
    const bricks = [...byWeek.values()].reduce((s, w) => s + w.bricks, 0);
    return { rows: withRun, opening, bricks, s: settle({ opening, earnings, kharcha, paidByUs, paidByThem, deductions }) };
  }, [q.data, t]);

  async function savePay() {
    const amount = parseInt(pay.amount, 10);
    if (!Number.isInteger(amount) || amount <= 0) return toast.error("Whole rupees only");
    if (!pay.handler) return toast.error(t("paidBy"));
    const m = payMap[pay.type];
    const { error } = await supabase.from("transactions").insert({
      entry_date: pay.date, party_id: id, season_id: q.data?.party.season_id, kind: m.kind, direction: m.direction, amount,
      method: pay.method as "cash", handler_user_id: pay.handler, category: "patheer", note: pay.note || null, created_by: await myId(),
    });
    if (error) return toast.error(error.message);
    setPay({ ...pay, amount: "", note: "" });
    qc.invalidateQueries();
  }
  async function voidTx(txId: string) {
    const { error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", txId);
    if (error) toast.error(error.message);
    qc.invalidateQueries();
  }
  async function addRate() {
    const v = parseInt(rate.value, 10);
    if (!Number.isInteger(v) || v <= 0) return toast.error("Whole numbers only");
    const { error } = await supabase.from("party_rates").insert({ party_id: id, kind: rate.kind, rate_per_1000: v, effective_from: rate.from, created_by: await myId() });
    if (error) return toast.error(error.message);
    setRate({ ...rate, value: "" });
    qc.invalidateQueries();
  }

  if (!q.data || !view) return <div className="p-8 text-center text-muted-foreground">…</div>;
  const { party } = q.data;
  const s = view.s;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/patheer" className="no-print text-sm text-primary underline">← {t("patheer")}</Link>
          <h1 className="text-3xl font-bold">{party.name}</h1>
          <span className="num text-muted-foreground">{party.phone}</span>
        </div>
        <Button className="no-print" variant="outline" onClick={() => window.print()}>{t("print")}</Button>
      </div>

      {/* Settlement statement */}
      <section className="register-paper rounded-xl border-2 border-primary/30 p-5">
        <h2 className="mb-3 text-xl font-bold text-primary">{t("settlement")}</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-lg md:grid-cols-3">
          <dt>{t("confirmed")} {t("bricks")}</dt><dd className="num font-semibold">{fmt(view.bricks)}</dd>
          <dt>{t("opening")}</dt><dd className="num">{fmt(s.opening)}</dd>
          <dt>{t("earnings")}</dt><dd className="num">{fmt(s.earnings)}</dd>
          <dt>{t("kharcha")}</dt><dd className="num">− {fmt(s.kharcha)}</dd>
          <dt>{t("payHim")}</dt><dd className="num">− {fmt(s.paidByUs)}</dd>
          <dt>{t("hePays")}</dt><dd className="num">+ {fmt(s.paidByThem)}</dd>
          <dt>{t("deduction")}</dt><dd className="num">− {fmt(s.deductions)}</dd>
        </dl>
        <div className="mt-4 flex items-center gap-3 border-t-2 border-primary pt-3 text-2xl font-bold">
          {t("balance")}: <span className="num">{fmt(Math.abs(s.balance))}</span> <BalanceBadge balance={s.balance} />
        </div>
      </section>

      {/* Payment entry */}
      <section className="no-print grid gap-3 rounded-xl border bg-card p-5 md:grid-cols-4">
        <div><Label>{t("type")}</Label>
          <select className="h-12 w-full rounded-md border bg-background px-2 text-lg" value={pay.type} onChange={(e) => setPay({ ...pay, type: e.target.value as PayKind })}>
            <option value="pay">{t("payHim")}</option><option value="receive">{t("hePays")}</option>
            <option value="kharcha">{t("kharcha")}</option><option value="deduct">{t("deduction")}</option>
          </select></div>
        <div><Label>{t("amount")}</Label><Input className="h-12 num text-xl" inputMode="numeric" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value.replace(/\D/g, "") })} /></div>
        <div><Label>{t("date")}</Label><Input className="h-12" type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
        <div><Label>{pay.type === "receive" ? t("receivedBy") : t("paidBy")}</Label>
          <select className="h-12 w-full rounded-md border bg-background px-2 text-lg" value={pay.handler} onChange={(e) => setPay({ ...pay, handler: e.target.value })}>
            <option value="">—</option>
            {(owners.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.display_name}</option>)}
          </select></div>
        <div><Label>{t("method")}</Label>
          <select className="h-12 w-full rounded-md border bg-background px-2" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
            <option value="cash">Cash</option><option value="bank">Bank</option><option value="easypaisa">Easypaisa</option><option value="jazzcash">JazzCash</option>
          </select></div>
        <div className="md:col-span-2"><Label>{t("note")}</Label><Input className="h-12" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} /></div>
        <div className="flex items-end"><ConfirmButton size="lg" onConfirm={savePay} disabled={!pay.amount}>{t("save")}</ConfirmButton></div>
      </section>

      {/* Running ledger */}
      <section className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-base">
          <thead className="bg-secondary"><tr>
            <th className="p-2 text-start">{t("date")}</th><th className="p-2 text-start">{t("ledger")}</th>
            <th className="p-2">+</th><th className="p-2">−</th><th className="p-2">{t("balance")}</th><th className="no-print" />
          </tr></thead>
          <tbody>
            <tr className="border-t"><td className="num p-2">—</td><td className="p-2">{t("opening")}</td><td /><td /><td className="num p-2 text-center font-semibold">{fmt(view.opening)}</td><td className="no-print" /></tr>
            {view.rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="num p-2">{r.date}</td>
                <td className="p-2">{r.label}{r.note ? <span className="text-sm text-muted-foreground"> — {r.note}</span> : null}</td>
                <td className="num p-2 text-center text-success">{r.plus ? fmt(r.plus) : ""}</td>
                <td className="num p-2 text-center text-destructive">{r.minus ? fmt(r.minus) : ""}</td>
                <td className="num p-2 text-center font-semibold">{fmt(r.run)}</td>
                <td className="no-print p-1">{r.txId && <ConfirmButton size="sm" variant="outline" onConfirm={() => voidTx(r.txId!)}>{t("remove")}</ConfirmButton>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Rates */}
      <section className="no-print rounded-xl border bg-card p-5">
        <h2 className="mb-3 text-xl font-bold">{t("rates")}</h2>
        <div className="mb-4 flex flex-wrap gap-2">
          {q.data.rates.map((r) => (
            <span key={r.id} className="rounded bg-muted px-3 py-1">{r.kind === "earning" ? t("rate") : t("kharchaRate")}: <span className="num font-semibold">{fmt(Number(r.rate_per_1000))}</span> <span className="num text-sm">({r.effective_from})</span></span>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select className="h-12 rounded-md border bg-background px-2" value={rate.kind} onChange={(e) => setRate({ ...rate, kind: e.target.value as "earning" })}>
            <option value="earning">{t("rate")}</option><option value="kharcha">{t("kharchaRate")}</option>
          </select>
          <Input className="h-12 w-32 num text-lg" inputMode="numeric" value={rate.value} onChange={(e) => setRate({ ...rate, value: e.target.value.replace(/\D/g, "") })} />
          <Input className="h-12 w-44" type="date" value={rate.from} onChange={(e) => setRate({ ...rate, from: e.target.value })} />
          <ConfirmButton onConfirm={addRate} disabled={!rate.value}>{t("add")}</ConfirmButton>
        </div>
      </section>
    </div>
  );
}
