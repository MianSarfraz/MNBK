"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, fmtMonth, useT, type Key } from "@/lib/i18n";
import { addDays, monthEnd, monthStart, parseQtyMilli, parseWhole, purchaseAmount, statement } from "@/lib/kiln-math";
import { DEFAULT_UNIT, deleteVia, errMsg, fetchAll, MATERIALS, myId, today, UNITS, useExpenseCategories, useOwners, useSupplierAccounts, type Material } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Empty, methodLabel, METHODS, OwnerSelect, PageHeader, PrintHeader, Stat, type Method } from "@/components/kit";
import { Cell, LetterRow, Sheet } from "@/components/sheet";

type Purchase = Tables<"purchases">;
type Payment = Tables<"transactions">;
type Agent = Tables<"supplier_accounts">;
const MAT_KEY: Record<Material, Key> = { coal: "matCoal", wood: "matWood", boora: "matBoora", other: "matOther" };
const fmtQty = (q: number | null) => (q == null ? "" : Number(q).toLocaleString("en-US", { maximumFractionDigits: 3 }));

/** Fuel khatta: coal trucks, wood and boora bought from agents, payments to them, and each agent's tab. */
export default function FuelPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"purchases" | "payments" | "agents">("purchases");
  const [month, setMonth] = useState(monthStart(today()));
  const [allTime, setAllTime] = useState(false);
  const [fAgent, setFAgent] = useState("");
  const [fMat, setFMat] = useState("");
  const from = allTime ? "1900-01-01" : month;
  const to = allTime ? "2999-12-31" : monthEnd(month);
  const agentsQ = useSupplierAccounts();
  const agents = agentsQ.data ?? [];
  const owners = useOwners();
  const cats = useExpenseCategories();
  const fuelCat = (cats.data ?? []).find((c) => /coal|fuel/i.test(c.name_en))?.id ?? null;

  const purchasesQ = useQuery({
    queryKey: ["purchases", from, to],
    queryFn: () => fetchAll<Purchase>((a, b) => supabase.from("purchases").select("*").is("deleted_at", null).gte("entry_date", from).lte("entry_date", to).order("entry_date").order("ref_no").range(a, b)),
  });
  const agentIds = agents.map((a) => a.party_id!);
  const paymentsQ = useQuery({
    queryKey: ["fuel-payments", from, to, agentIds.join(",")],
    enabled: agentIds.length > 0,
    queryFn: () => fetchAll<Payment>((a, b) => supabase.from("transactions").select("*").is("deleted_at", null).in("party_id", agentIds).neq("kind", "adjustment")
      .gte("entry_date", from).lte("entry_date", to).order("entry_date").order("ref_no").range(a, b)),
  });

  const purchases = (purchasesQ.data ?? []).filter((p) => (!fAgent || p.supplier_id === fAgent) && (!fMat || p.material === fMat));
  const payments = (paymentsQ.data ?? []).filter((p) => agentIds.includes(p.party_id ?? "") && (!fAgent || p.party_id === fAgent));
  const agentName = (id: string | null) => agents.find((a) => a.party_id === id)?.name ?? "—";
  const ownerName = (id: string) => (owners.data ?? []).find((o) => o.id === id)?.display_name ?? "—";
  const sumP = purchases.reduce((s, p) => s + Number(p.amount), 0);
  const sumPay = payments.reduce((s, p) => s + (p.direction === "out" ? 1 : -1) * Number(p.amount), 0);
  const owed = agents.reduce((s, a) => s + Math.max(0, Number(a.balance)), 0);
  const coalTrucks = purchases.filter((p) => p.material === "coal").length;
  const refresh = () => ["purchases", "fuel-payments", "supplier-accounts", "agent-statement"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  async function updatePurchase(id: string, patch: Partial<Purchase>) {
    const { error } = await supabase.from("purchases").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }
  async function updatePayment(id: string, patch: Partial<Payment>) {
    const { error } = await supabase.from("transactions").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }
  async function updateAgent(id: string, patch: Partial<Tables<"parties">>) {
    const { error } = await supabase.from("parties").update(patch).eq("id", id);
    if (error) toast.error(/unique|duplicate/i.test(error.message) ? t("duplicateAgent") : error.message);
    refresh();
  }

  function exportXls() {
    downloadExcel(`fuel-${allTime ? "all" : month.slice(0, 7)}`, [
      { name: "Purchases", rows: [["Date", "Agent", "Material", "Truck no", "Quantity", "Unit", "Rate", "Amount", "Bilty / ref", "Note"],
        ...purchases.map((p) => [p.entry_date, agentName(p.supplier_id), p.material, p.truck_no ?? "", p.quantity == null ? "" : Number(p.quantity), p.unit ?? "", p.rate ?? "", Number(p.amount), p.reference ?? "", p.notes ?? ""]),
        [], ["", "", "", "", "", "", "Total", sumP]] },
      { name: "Payments", rows: [["Date", "Agent", "Amount", "Method", "Paid by", "Reference", "Note"],
        ...payments.map((p) => [p.entry_date, agentName(p.party_id), (p.direction === "out" ? 1 : -1) * Number(p.amount), p.method, ownerName(p.handler_user_id), p.reference ?? "", p.note ?? ""]),
        [], ["", "Total", sumPay]] },
      { name: "Agents", rows: [["Agent", "Phone", "Opening", "Coal", "Wood", "Boora", "Other", "Purchased", "Paid", "We owe (+) / advance (−)"],
        ...agents.map((a) => [a.name ?? "", a.phone ?? "", Number(a.opening), Number(a.coal), Number(a.wood), Number(a.boora), Number(a.other), Number(a.purchases), Number(a.payments), Number(a.balance)])] },
    ]);
  }

  const selected = agents.find((a) => a.party_id === fAgent);
  return (
    <div className="space-y-3">
      <PrintHeader title={t("fuelKhatta")} sub={allTime ? t("allTime") : fmtMonth(month)} />
      <PageHeader title={t("fuelKhatta")} sub={t("fuelHelp")} actions={<>
        <Button variant="outline" size="sm" onClick={exportXls}>Excel</Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>{t("print")}</Button>
      </>} />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label={t("owedToAgents")} value={owed} money tone="warn" />
        <Stat label={t("purchasedInPeriod")} value={sumP} money />
        <Stat label={t("paidInPeriod")} value={sumPay} money tone="good" />
        <Stat label={t("coalTrucks")} value={coalTrucks} />
      </div>

      <div className="no-print flex flex-wrap items-center gap-2 text-sm">
        <div className="flex items-center rounded-lg border bg-card">
          <button className="h-9 px-3 text-lg disabled:opacity-40" disabled={allTime} onClick={() => setMonth(monthStart(addDays(month, -1)))} aria-label="previous month">‹</button>
          <span className="min-w-24 text-center font-semibold">{allTime ? t("allTime") : fmtMonth(month)}</span>
          <button className="h-9 px-3 text-lg disabled:opacity-40" disabled={allTime} onClick={() => setMonth(monthStart(addDays(monthEnd(month), 1)))} aria-label="next month">›</button>
        </div>
        <label className="flex items-center gap-2"><Switch checked={allTime} onCheckedChange={setAllTime} />{t("allTime")}</label>
        <select className="h-9 rounded-md border bg-card px-2" value={fAgent} onChange={(e) => setFAgent(e.target.value)} aria-label={t("agent")}>
          <option value="">{t("allAgents")}</option>{agents.map((a) => <option key={a.party_id} value={a.party_id!}>{a.name}</option>)}
        </select>
        <select className="h-9 rounded-md border bg-card px-2" value={fMat} onChange={(e) => setFMat(e.target.value)} aria-label={t("material")}>
          <option value="">{t("allMaterials")}</option>{MATERIALS.map((m) => <option key={m} value={m}>{t(MAT_KEY[m])}</option>)}
        </select>
      </div>

      <div className="no-print flex gap-1 border-b">
        {(["purchases", "payments", "agents"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-semibold ${tab === k ? "border-b-card bg-card text-primary" : "border-transparent text-muted-foreground"}`}>
            {t(k === "purchases" ? "fuelPurchases" : k === "payments" ? "fuelPayments" : "agentsTab")}
          </button>
        ))}
      </div>

      {tab === "purchases" && (
        <Sheet minWidth={1150}>
          <thead>
            <LetterRow cols={11} />
            <tr><th className="rn">#</th><th className="w-36">{t("date")}</th><th className="w-40">{t("agent")}</th><th className="w-28">{t("material")}</th><th className="w-28">{t("truckNo")}</th>
              <th className="n w-24">{t("quantityCol")}</th><th className="w-24">{t("unit")}</th><th className="n w-24">{t("ratePerUnit")}</th><th className="n w-28">{t("amountRs")}</th>
              <th className="w-28">{t("biltyRef")}</th><th>{t("note")}</th><th className="no-print w-10" /></tr>
          </thead>
          <tbody>
            {purchases.map((p, i) => (
              <tr key={p.id} className={i > 0 && purchases[i - 1]!.entry_date !== p.entry_date ? "day-start" : ""}>
                <td className="rn">{i + 1}</td>
                <td className="c"><Cell type="date" value={p.entry_date} onCommit={(v) => v && updatePurchase(p.id, { entry_date: v })} /></td>
                <td className="c"><select className="cell" value={p.supplier_id} onChange={(e) => updatePurchase(p.id, { supplier_id: e.target.value })} aria-label={t("agent")}>
                  {agents.map((a) => <option key={a.party_id} value={a.party_id!}>{a.name}</option>)}</select></td>
                <td className="c"><select className="cell" value={p.material} onChange={(e) => updatePurchase(p.id, { material: e.target.value })} aria-label={t("material")}>
                  {MATERIALS.map((m) => <option key={m} value={m}>{t(MAT_KEY[m])}</option>)}</select></td>
                <td className="c"><Cell value={p.truck_no ?? ""} placeholder="—" onCommit={(v) => updatePurchase(p.id, { truck_no: v.trim() || null })} /></td>
                <td className="c"><Cell value={fmtQty(p.quantity)} placeholder="—" className="text-end num" onCommit={(v) => {
                  if (!v.trim()) return void updatePurchase(p.id, { quantity: null });
                  const q = parseQtyMilli(v); if (q == null || q <= 0) return void toast.error(t("badQuantity"));
                  void updatePurchase(p.id, { quantity: q / 1000, ...(p.rate ? { amount: purchaseAmount(q, Number(p.rate)) } : {}) });
                }} /></td>
                <td className="c"><select className="cell" value={p.unit ?? ""} onChange={(e) => updatePurchase(p.id, { unit: e.target.value || null })} aria-label={t("unit")}>
                  <option value="">—</option>{UNITS.map((u) => <option key={u} value={u}>{t(`u_${u}` as Key)}</option>)}</select></td>
                <td className="c"><Cell numeric value={p.rate == null ? "" : String(Number(p.rate))} placeholder="—" onCommit={(v) => {
                  const r = parseWhole(v); if (r == null) return void updatePurchase(p.id, { rate: null });
                  void updatePurchase(p.id, { rate: r, ...(p.quantity != null ? { amount: purchaseAmount(Math.round(Number(p.quantity) * 1000), r) } : {}) });
                }} /></td>
                <td className="c"><Cell numeric className="font-semibold" value={String(Number(p.amount))} label={`${t("amountRs")} ${i + 1}`} onCommit={(v) => { const n = parseWhole(v); if (n != null && n >= 0) updatePurchase(p.id, { amount: n }); }} /></td>
                <td className="c"><Cell value={p.reference ?? ""} placeholder="—" onCommit={(v) => updatePurchase(p.id, { reference: v.trim() || null })} /></td>
                <td className="c"><Cell value={p.notes ?? ""} placeholder="—" onCommit={(v) => updatePurchase(p.id, { notes: v.trim() || null })} /></td>
                <td className="no-print px-1"><ConfirmButton size="sm" variant="outline" onConfirm={() => updatePurchase(p.id, { deleted_at: new Date().toISOString() })}>×</ConfirmButton></td>
              </tr>
            ))}
            <NewPurchaseRow n={purchases.length + 1} agents={agents} preset={fAgent} last={purchases.at(-1)} onSaved={refresh} />
            <tr className="total"><td className="rn" /><td colSpan={7}>{t("total")}</td><td className="n num">{fmt(sumP)}</td><td colSpan={3} /></tr>
          </tbody>
        </Sheet>
      )}

      {tab === "payments" && (
        <Sheet minWidth={960}>
          <thead>
            <LetterRow cols={8} />
            <tr><th className="rn">#</th><th className="w-36">{t("date")}</th><th className="w-44">{t("agent")}</th><th className="n w-32">{t("amountRs")}</th><th className="w-28">{t("method")}</th>
              <th className="w-36">{t("paidBy")}</th><th className="w-32">{t("referenceNo")}</th><th>{t("note")}</th><th className="no-print w-10" /></tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={p.id}>
                <td className="rn">{i + 1}</td>
                <td className="c"><Cell type="date" value={p.entry_date} onCommit={(v) => v && updatePayment(p.id, { entry_date: v })} /></td>
                <td className="whitespace-nowrap px-2">{agentName(p.party_id)}{p.direction === "in" && <span className="ms-1 text-[10px] text-destructive">{t("refund")}</span>}</td>
                <td className="c"><Cell numeric className="font-semibold" value={String(Number(p.amount))} onCommit={(v) => { const n = parseWhole(v); if (n && n > 0) updatePayment(p.id, { amount: n }); }} /></td>
                <td className="c"><select className="cell" value={p.method} onChange={(e) => updatePayment(p.id, { method: e.target.value as Method })}>
                  {METHODS.map((m) => <option key={m} value={m}>{methodLabel(t, m)}</option>)}</select></td>
                <td className="text-xs">{ownerName(p.handler_user_id)}</td>
                <td className="c"><Cell value={p.reference ?? ""} placeholder="—" onCommit={(v) => updatePayment(p.id, { reference: v.trim() || null })} /></td>
                <td className="c"><Cell value={p.note ?? ""} placeholder="—" onCommit={(v) => updatePayment(p.id, { note: v.trim() || null })} /></td>
                <td className="no-print px-1"><ConfirmButton size="sm" variant="outline" onConfirm={() => updatePayment(p.id, { deleted_at: new Date().toISOString() })}>×</ConfirmButton></td>
              </tr>
            ))}
            <NewPaymentRow n={payments.length + 1} agents={agents} preset={fAgent} categoryId={fuelCat} onSaved={() => { refresh(); qc.invalidateQueries({ queryKey: ["transactions"] }); }} />
            <tr className="total"><td className="rn" /><td colSpan={2}>{t("total")}</td><td className="n num">{fmt(sumPay)}</td><td colSpan={5} /></tr>
          </tbody>
        </Sheet>
      )}

      {tab === "agents" && (
        <Sheet minWidth={1100}>
          <thead>
            <LetterRow cols={11} />
            <tr><th className="rn">#</th><th className="w-44">{t("agent")}</th><th className="w-32">{t("phone")}</th><th className="n w-28">{t("openingOwed")}</th>
              <th className="n w-28">{t("matCoal")}</th><th className="n w-24">{t("matWood")}</th><th className="n w-24">{t("matBoora")}</th><th className="n w-24">{t("matOther")}</th>
              <th className="n w-28">{t("purchases")}</th><th className="n w-28">{t("paymentsCol")}</th><th className="n w-32">{t("weOweCol")}</th><th className="w-24">{t("active")}</th></tr>
          </thead>
          <tbody>
            {agents.map((a, i) => (
              <tr key={a.party_id} className={`${a.is_active ? "" : "opacity-60"} ${a.party_id === fAgent ? "bg-primary/5" : ""}`}>
                <td className="rn">{i + 1}</td>
                <td className="c"><div className="flex items-center">
                  <Cell value={a.name ?? ""} className="font-medium" onCommit={(v) => v.trim() && updateAgent(a.party_id!, { name: v.trim() })} />
                  <button type="button" className="no-print px-1 text-xs text-primary hover:underline" onClick={() => setFAgent(a.party_id!)}>{t("tab")}</button>
                </div></td>
                <td className="c"><Cell value={a.phone ?? ""} placeholder="—" onCommit={(v) => updateAgent(a.party_id!, { phone: v.trim() || null })} /></td>
                <td className="c"><Cell numeric value={String(Number(a.opening))} onCommit={(v) => { const n = parseWhole(v, true); if (n != null) updateAgent(a.party_id!, { opening_balance: n }); }} /></td>
                <td className="n num">{fmt(Number(a.coal))}{Number(a.coal_trucks) ? <div className="text-[10px] text-muted-foreground">{fmt(Number(a.coal_trucks))} {t("trucks")}</div> : null}</td>
                <td className="n num">{fmt(Number(a.wood))}</td><td className="n num">{fmt(Number(a.boora))}</td><td className="n num">{fmt(Number(a.other))}</td>
                <td className="n num">{fmt(Number(a.purchases))}</td><td className="n num">{fmt(Number(a.payments))}</td>
                <td className="n num"><Owed value={Number(a.balance)} /></td>
                <td className="px-2"><div className="flex items-center gap-1">
                  <Switch checked={!!a.is_active} onCheckedChange={(v) => updateAgent(a.party_id!, { is_active: v })} />
                  <ConfirmButton size="sm" variant="outline" className="no-print h-7 px-2" title={t("del")} confirmLabel={t("del")} description={`${a.name}: ${t("deletePartyHelp")}`}
                    onConfirm={async () => { try { await deleteVia("delete_party", a.party_id!); toast.success(`${t("deleted")} — ${a.name}`); if (fAgent === a.party_id) setFAgent(""); } catch (e) { toast.error(errMsg(e)); } refresh(); qc.invalidateQueries({ queryKey: ["transactions"] }); }}>×</ConfirmButton>
                </div></td>
              </tr>
            ))}
            <NewAgentRow n={agents.length + 1} existing={agents} onSaved={refresh} />
            <tr className="total"><td className="rn" /><td colSpan={2}>{t("total")}</td>
              {(["opening", "coal", "wood", "boora", "other", "purchases", "payments", "balance"] as const).map((k) => <td key={k} className="n num">{fmt(agents.reduce((s, a) => s + Number(a[k]), 0))}</td>)}<td /></tr>
          </tbody>
        </Sheet>
      )}
      {tab === "purchases" && !purchasesQ.isLoading && !purchases.length && <Empty>{agents.length ? t("fuelEmpty") : t("addAgentFirst")}</Empty>}

      {selected && <AgentStatement agent={selected} onClose={() => setFAgent("")} />}
    </div>
  );
}

function Owed({ value }: { value: number }) {
  const { t } = useT();
  if (value === 0) return <span className="text-muted-foreground">0</span>;
  return value > 0 ? <span className="font-semibold text-destructive">{fmt(value)}</span>
    : <span className="font-semibold text-success">{fmt(-value)} <span className="font-sans text-[10px]">{t("advance")}</span></span>;
}

/** One agent's tab: opening, every purchase (+) and payment (−), running balance. */
function AgentStatement({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const { t } = useT();
  const id = agent.party_id!;
  const q = useQuery({
    queryKey: ["agent-statement", id],
    queryFn: async () => {
      const [pu, pa] = await Promise.all([
        fetchAll<Purchase>((a, b) => supabase.from("purchases").select("*").eq("supplier_id", id).is("deleted_at", null).order("entry_date").range(a, b)),
        fetchAll<Payment>((a, b) => supabase.from("transactions").select("*").eq("party_id", id).is("deleted_at", null).neq("kind", "adjustment").order("entry_date").range(a, b)),
      ]);
      return { pu, pa };
    },
  });
  const MAT: Record<string, Key> = MAT_KEY;
  const st = useMemo(() => statement(Number(agent.opening), [
    ...(q.data?.pu ?? []).map((p) => ({ date: p.entry_date, amount: Number(p.amount), label: `${t(MAT[p.material] ?? "matOther")}${p.truck_no ? ` · ${p.truck_no}` : ""}${p.quantity != null ? ` · ${fmtQty(p.quantity)} ${p.unit ? t(`u_${p.unit}` as Key) : ""}` : ""}` })),
    ...(q.data?.pa ?? []).map((p) => ({ date: p.entry_date, amount: (p.direction === "out" ? -1 : 1) * Number(p.amount), label: `${t("payment")}${p.reference ? ` · ${p.reference}` : ""}` })),
  ]), [q.data, agent.opening, t, MAT]);
  return (
    <div className="space-y-1 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-base font-bold">{agent.name} — {t("agentTab")} {agent.phone && <span className="num text-sm font-normal text-muted-foreground">{agent.phone}</span>}</div>
        <div className="flex items-center gap-2 text-sm">{t("weOweCol")}: <Owed value={st.closing} /><Button size="sm" variant="outline" className="no-print h-7" onClick={onClose}>×</Button></div>
      </div>
      <Sheet minWidth={640}>
        <thead><tr><th className="rn">#</th><th className="w-28">{t("date")}</th><th>{t("detail")}</th><th className="n w-28">{t("purchases")}</th><th className="n w-28">{t("paymentsCol")}</th><th className="n w-32">{t("balanceCol")}</th></tr></thead>
        <tbody>
          <tr><td className="rn" /><td /><td className="text-muted-foreground">{t("openingOwed")}</td><td /><td /><td className="n num">{fmt(st.broughtForward)}</td></tr>
          {st.rows.map((r, i) => (
            <tr key={i}><td className="rn">{i + 1}</td><td className="num">{fmtDate(r.date)}</td><td>{r.label}</td>
              <td className="n num">{r.amount > 0 ? fmt(r.amount) : ""}</td><td className="n num text-success">{r.amount < 0 ? fmt(-r.amount) : ""}</td><td className="n num font-semibold">{fmt(r.running)}</td></tr>
          ))}
          <tr className="total"><td className="rn" /><td colSpan={2}>{t("total")}</td><td className="n num">{fmt(st.credits)}</td><td className="n num">{fmt(st.debits)}</td><td className="n num">{fmt(st.closing)}</td></tr>
        </tbody>
      </Sheet>
    </div>
  );
}

function NewPurchaseRow({ n, agents, preset, last, onSaved }: { n: number; agents: Agent[]; preset: string; last: Purchase | undefined; onSaved: () => void }) {
  const { t } = useT();
  const blank = { date: "", agent: "", material: "coal" as Material, truck: "", qty: "", unit: "", rate: "", amount: "", ref: "", note: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const date = f.date || last?.entry_date || today();
  const agent = f.agent || preset || last?.supplier_id || "";
  const unit = f.unit || DEFAULT_UNIT[f.material];
  const qty = parseQtyMilli(f.qty);
  const rate = parseWhole(f.rate);
  const auto = qty != null && rate != null ? purchaseAmount(qty, rate) : null;
  const amount = f.amount ? parseWhole(f.amount) : auto;
  async function save() {
    if (!agent) return void toast.error(t("chooseAgent"));
    if (f.qty && qty == null) return void toast.error(t("badQuantity"));
    if (amount == null) return void toast.error(t("amountOrQtyRate"));
    setBusy(true);
    try {
      const { error } = await supabase.from("purchases").insert({
        entry_date: date, supplier_id: agent, material: f.material, truck_no: f.truck.trim() || null, quantity: qty == null ? null : qty / 1000,
        unit: f.qty ? unit : null, rate, amount, reference: f.ref.trim() || null, notes: f.note.trim() || null, created_by: await myId(),
      });
      if (error) throw error;
      toast.success(`${t("saved")} — Rs ${fmt(amount)}`);
      setF({ ...blank, date, agent, material: f.material, rate: f.rate });
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); save(); } };
  return (
    <tr className="new no-print">
      <td className="rn">{n}</td>
      <td className="c"><input className="cell" type="date" value={date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label={t("date")} /></td>
      <td className="c"><select className="cell" value={agent} onChange={(e) => setF({ ...f, agent: e.target.value })} aria-label={t("agent")}>
        <option value="">{t("chooseAgent")}</option>{agents.filter((a) => a.is_active).map((a) => <option key={a.party_id} value={a.party_id!}>{a.name}</option>)}</select></td>
      <td className="c"><select className="cell" value={f.material} onChange={(e) => setF({ ...f, material: e.target.value as Material, unit: "" })} aria-label={t("material")}>
        {MATERIALS.map((m) => <option key={m} value={m}>{t(MAT_KEY[m])}</option>)}</select></td>
      <td className="c"><input className="cell" placeholder={f.material === "coal" ? "LES-1234" : "—"} value={f.truck} onChange={(e) => setF({ ...f, truck: e.target.value })} onKeyDown={enter} aria-label={t("truckNo")} /></td>
      <td className="c"><input className="cell n num" inputMode="decimal" placeholder="0" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} onKeyDown={enter} aria-label={t("quantityCol")} /></td>
      <td className="c"><select className="cell" value={unit} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label={t("unit")}>
        {UNITS.map((u) => <option key={u} value={u}>{t(`u_${u}` as Key)}</option>)}</select></td>
      <td className="c"><input className="cell n num" inputMode="numeric" placeholder="0" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} onKeyDown={enter} aria-label={t("ratePerUnit")} /></td>
      <td className="c"><input className="cell n num font-semibold" inputMode="numeric" placeholder={auto != null ? fmt(auto) : "0"} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} onKeyDown={enter} aria-label={t("amountRs")} /></td>
      <td className="c"><input className="cell" placeholder="—" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} onKeyDown={enter} aria-label={t("biltyRef")} /></td>
      <td className="c"><input className="cell" placeholder={t("note")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onKeyDown={enter} /></td>
      <td className="px-1"><Button size="sm" className="h-7" disabled={busy || !agent || amount == null} onClick={save}>{t("add")}</Button></td>
    </tr>
  );
}

function NewPaymentRow({ n, agents, preset, categoryId, onSaved }: { n: number; agents: Agent[]; preset: string; categoryId: string | null; onSaved: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({ date: today(), agent: "", amount: "", method: "cash" as Method, by: "", ref: "", note: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { myId().then((id) => setF((x) => ({ ...x, by: x.by || id }))).catch(() => {}); }, []);
  const agent = f.agent || preset;
  const owes = Number(agents.find((a) => a.party_id === agent)?.balance ?? 0);
  async function save() {
    const amount = parseWhole(f.amount);
    if (!agent) return void toast.error(t("chooseAgent"));
    if (!amount || amount <= 0) return void toast.error(t("wholeNumbers"));
    if (!f.by) return void toast.error(t("paidBy"));
    setBusy(true);
    try {
      const { error } = await supabase.from("transactions").insert({
        entry_date: f.date, party_id: agent, kind: "expense", direction: "out", amount, method: f.method, handler_user_id: f.by,
        category: "fuel_payment", expense_category_id: categoryId, reference: f.ref.trim() || null, note: f.note.trim() || null, created_by: await myId(),
      });
      if (error) throw error;
      toast.success(`${t("saved")} — Rs ${fmt(amount)}`);
      setF({ ...f, amount: "", ref: "", note: "" });
      onSaved();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); save(); } };
  return (
    <tr className="new no-print">
      <td className="rn">{n}</td>
      <td className="c"><input className="cell" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label={t("date")} /></td>
      <td className="c"><select className="cell" value={agent} onChange={(e) => setF({ ...f, agent: e.target.value })} aria-label={t("agent")}>
        <option value="">{t("chooseAgent")}</option>{agents.filter((a) => a.is_active).map((a) => <option key={a.party_id} value={a.party_id!}>{a.name}</option>)}</select></td>
      <td className="c"><input className="cell n num font-semibold" inputMode="numeric" placeholder={owes > 0 ? fmt(owes) : "0"} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} onKeyDown={enter} aria-label={t("amountRs")} /></td>
      <td className="c"><select className="cell" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as Method })}>{METHODS.map((m) => <option key={m} value={m}>{methodLabel(t, m)}</option>)}</select></td>
      <td className="c"><OwnerSelect className="cell h-auto border-0" value={f.by} onChange={(v) => setF({ ...f, by: v })} /></td>
      <td className="c"><input className="cell" placeholder="—" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} onKeyDown={enter} aria-label={t("referenceNo")} /></td>
      <td className="c"><input className="cell" placeholder={t("note")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onKeyDown={enter} /></td>
      <td className="px-1"><Button size="sm" className="h-7" disabled={busy || !agent || !f.amount} onClick={save}>{t("add")}</Button></td>
    </tr>
  );
}

function NewAgentRow({ n, existing, onSaved }: { n: number; existing: Agent[]; onSaved: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({ name: "", phone: "", opening: "" });
  const dup = !!f.name.trim() && existing.some((a) => (a.name ?? "").trim().toLowerCase() === f.name.trim().toLowerCase());
  async function save() {
    const name = f.name.trim().replace(/\s+/g, " ");
    if (!name || dup) return void toast.error(dup ? t("duplicateAgent") : t("name"));
    const { error } = await supabase.from("parties").insert({ kind: "vendor", name, phone: f.phone.trim() || null, opening_balance: parseWhole(f.opening, true) ?? 0, created_by: await myId() });
    if (error) return void toast.error(/unique|duplicate/i.test(error.message) ? t("duplicateAgent") : error.message);
    toast.success(`${t("saved")} — ${name}`);
    setF({ name: "", phone: "", opening: "" });
    onSaved();
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && f.name.trim()) { e.preventDefault(); save(); } };
  return (
    <tr className="new no-print">
      <td className="rn">{n}</td>
      <td className={`c ${dup ? "warn" : ""}`}><input className={`cell font-medium ${dup ? "bad" : ""}`} placeholder={t("newAgentName")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={enter} aria-label={t("newAgentName")} /></td>
      <td className="c"><input className="cell" inputMode="tel" placeholder="—" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} onKeyDown={enter} /></td>
      <td className="c"><input className="cell n num" inputMode="numeric" placeholder="0" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} onKeyDown={enter} aria-label={t("openingOwed")} /></td>
      <td colSpan={7} className="text-[11px] text-muted-foreground">{dup ? <span className="text-destructive">{t("duplicateAgent")}</span> : t("openingOwedHelp")}</td>
      <td className="px-1"><Button size="sm" className="h-7" disabled={!f.name.trim() || dup} onClick={save}>{t("add")}</Button></td>
    </tr>
  );
}
