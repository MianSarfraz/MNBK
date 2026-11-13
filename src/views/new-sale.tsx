"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, useT } from "@/lib/i18n";
import { amountFor, invoiceTotal, parseWhole } from "@/lib/kiln-math";
import { errMsg, today, useLedgers, useParties, useQualities } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ConfirmButton";
import { BalanceBadge } from "@/components/BalanceBadge";
import { DateInput, Field, MethodSelect, NumInput, OwnerSelect, PageHeader, Section, Select, type Method } from "@/components/kit";

type Line = { quality: string; qty: string; rate: string };

export default function NewSale() {
  const { t } = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const initialCustomer = useSearchParams().get("customer") ?? undefined;
  const customers = useParties("customer");
  const qualities = useQualities();
  const ledgers = useLedgers();
  const stockQ = useQuery({
    queryKey: ["finished-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("finished_stock").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const lastRates = useQuery({
    queryKey: ["last-rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sale_items").select("quality_id, rate_per_1000").is("deleted_at", null).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) if (!m.has(r.quality_id)) m.set(r.quality_id, Number(r.rate_per_1000));
      return m;
    },
  });

  const [h, setH] = useState({ date: today(), customer: initialCustomer ?? "", vehicle: "", driver: "", discount: "", delivery: "", note: "" });
  const [lines, setLines] = useState<Line[]>([{ quality: "", qty: "", rate: "" }]);
  const [pay, setPay] = useState({ amount: "", method: "cash" as Method, handler: "" });
  const [busy, setBusy] = useState(false);

  const saleQualities = (qualities.data ?? []).filter((q) => q.kind === "sale" && q.is_active);
  const qById = new Map((qualities.data ?? []).map((q) => [q.id, q]));
  const parsed = lines.map((l) => ({ ...l, q: parseWhole(l.qty) ?? 0, r: parseWhole(l.rate) ?? 0 }));
  const valid = parsed.filter((l) => l.quality && l.q > 0 && l.r > 0);
  const discount = parseWhole(h.discount) ?? 0;
  const delivery = parseWhole(h.delivery) ?? 0;
  const totals = useMemo(() => {
    try { return { ok: true as const, ...invoiceTotal(valid.map((l) => ({ quantity: l.q, rate_per_1000: l.r })), discount, delivery) }; }
    catch (e) { return { ok: false as const, error: errMsg(e) }; }
  }, [valid, discount, delivery]);

  // Stock warnings: sum requested per stock quality vs available.
  const warnings = useMemo(() => {
    const need = new Map<string, number>();
    for (const l of valid) {
      const sq = qById.get(l.quality)?.stock_quality_id;
      if (sq) need.set(sq, (need.get(sq) ?? 0) + l.q);
    }
    const out: string[] = [];
    for (const [sq, n] of need) {
      const st = (stockQ.data ?? []).find((s) => s.quality_id === sq);
      const avail = Number(st?.balance ?? 0);
      if (n > avail) out.push(`${st?.name_en}: ${t("available")} ${fmt(avail)}, ${t("selling")} ${fmt(n)}`);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, stockQ.data]);

  const prevBalance = Number((ledgers.data ?? []).find((l) => l.party_id === h.customer)?.balance ?? 0);
  const paidNow = parseWhole(pay.amount) ?? 0;
  const newBalance = totals.ok ? prevBalance - totals.total + paidNow : prevBalance;

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, j) => {
      if (j !== i) return l;
      const next = { ...l, ...patch };
      if (patch.quality && !l.rate) {
        const last = lastRates.data?.get(patch.quality);
        if (last) next.rate = String(last);
      }
      return next;
    }));
  }

  async function save() {
    if (!h.customer) return void toast.error(t("chooseCustomer"));
    if (!valid.length) return void toast.error(t("addLine"));
    if (valid.length !== parsed.filter((l) => l.quality || l.qty || l.rate).length) return void toast.error(t("incompleteLine"));
    if (!totals.ok) return void toast.error(totals.error);
    if (paidNow > 0 && !pay.handler) return void toast.error(t("receivedBy"));
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_sale", {
        _entry_date: h.date, _customer_id: h.customer, _vehicle_no: h.vehicle, _driver_name: h.driver,
        _discount: discount, _delivery: delivery, _note: h.note,
        _items: valid.map((l) => ({ quality_id: l.quality, quantity: l.q, rate_per_1000: l.r })),
        _paid: paidNow, _method: pay.method, _handler: pay.handler || null,
      });
      if (error) throw error;
      toast.success(t("saved"));
      qc.invalidateQueries();
      router.push(`/sales/${data as string}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("newSale")} actions={<Link href="/sales" className="inline-flex h-10 items-center rounded-md border bg-card px-4">{t("sales")}</Link>} />
      <Section>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label={t("customer")} className="md:col-span-2" hint={<Link href="/people/customer" className="text-primary underline">+ {t("addNew")} {t("customer")}</Link>}>
            <Select value={h.customer} onChange={(e) => setH({ ...h, customer: e.target.value })}>
              <option value="">—</option>{(customers.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}
            </Select>
          </Field>
          <Field label={t("date")}><DateInput value={h.date} onChange={(v) => setH({ ...h, date: v })} /></Field>
          {h.customer && <div className="flex flex-col justify-end pb-2"><span className="text-sm text-muted-foreground">{t("previousBalance")}</span><span className="num text-lg font-bold">{fmt(Math.abs(prevBalance))} <BalanceBadge balance={prevBalance} kind="customer" /></span></div>}
          <Field label={t("vehicle")}><Input className="h-10 num" value={h.vehicle} onChange={(e) => setH({ ...h, vehicle: e.target.value })} /></Field>
          <Field label={t("driver")}><Input className="h-10" value={h.driver} onChange={(e) => setH({ ...h, driver: e.target.value })} /></Field>
          <Field label={t("note")} className="md:col-span-2"><Input className="h-10" value={h.note} onChange={(e) => setH({ ...h, note: e.target.value })} /></Field>
        </div>
      </Section>

      <Section title={t("items")}>
        <div className="space-y-2">
          {parsed.map((l, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-lg border p-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <Field label={t("quality")} className="col-span-2 md:col-span-1"><Select value={l.quality} onChange={(e) => setLine(i, { quality: e.target.value })}>
                <option value="">—</option>{saleQualities.map((q) => <option key={q.id} value={q.id}>{q.name_en}</option>)}
              </Select></Field>
              <Field label={t("quantityBricks")}><NumInput value={l.qty} onChange={(v) => setLine(i, { qty: v })} /></Field>
              <Field label={t("rate")}><NumInput value={l.rate} onChange={(v) => setLine(i, { rate: v })} /></Field>
              <div className="pb-3 text-center"><div className="text-xs text-muted-foreground">{t("amount")}</div><div className="num text-lg font-bold">{l.q > 0 && l.r > 0 ? fmt(amountFor(l.q, l.r)) : "—"}</div></div>
              <Button variant="outline" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</Button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setLines([...lines, { quality: "", qty: "", rate: "" }])}>+ {t("addLine")}</Button>
        </div>
        {warnings.length > 0 && (
          <div className="mt-3 rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-destructive">
            <div className="font-bold">⚠ {t("stockWarning")}</div>
            {warnings.map((w) => <div key={w} className="num">{w}</div>)}
          </div>
        )}
      </Section>

      <Section title={t("total")}>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label={t("discount")}><NumInput value={h.discount} onChange={(v) => setH({ ...h, discount: v })} placeholder="0" /></Field>
          <Field label={t("deliveryCharges")}><NumInput value={h.delivery} onChange={(v) => setH({ ...h, delivery: v })} placeholder="0" /></Field>
          <div className="md:col-span-2 register-paper rounded-lg border p-3 text-lg">
            {totals.ok ? (<>
              <div className="flex justify-between"><span>{t("gross")} ({fmt(totals.bricks)} {t("bricks")})</span><span className="num">{fmt(totals.gross)}</span></div>
              <div className="flex justify-between"><span>{t("discount")}</span><span className="num">− {fmt(totals.discount)}</span></div>
              <div className="flex justify-between"><span>{t("deliveryCharges")}</span><span className="num">+ {fmt(totals.delivery)}</span></div>
              <div className="flex justify-between border-t-2 border-primary pt-1 text-2xl font-bold"><span>{t("invoiceTotal")}</span><span className="num">Rs {fmt(totals.total)}</span></div>
            </>) : <div className="text-destructive">{totals.error}</div>}
          </div>
        </div>
        <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-4">
          <Field label={t("receivedNow")}><NumInput value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} placeholder="0" /></Field>
          <Field label={t("method")}><MethodSelect value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} /></Field>
          <Field label={t("receivedBy")}><OwnerSelect value={pay.handler} onChange={(v) => setPay((p) => ({ ...p, handler: v }))} /></Field>
          {totals.ok && <Button variant="outline" className="mt-auto h-10" onClick={() => setPay({ ...pay, amount: String(totals.total) })}>{t("fullPayment")}</Button>}
        </div>
        {h.customer && totals.ok && (
          <div className="mt-3 text-lg">{t("balanceAfter")}: <span className="num font-bold">{fmt(Math.abs(newBalance))}</span> <BalanceBadge balance={newBalance} kind="customer" /></div>
        )}
        <div className="mt-4">
          <ConfirmButton size="lg" onConfirm={save} disabled={busy || !valid.length || !h.customer}
            description={`${t("invoiceTotal")}: Rs ${fmt(totals.ok ? totals.total : 0)}${warnings.length ? ` — ⚠ ${t("stockWarning")}` : ""}`}>
            {t("saveInvoice")}
          </ConfirmButton>
        </div>
      </Section>
    </div>
  );
}
