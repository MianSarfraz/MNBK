"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { parseWhole } from "@/lib/kiln-math";
import { customerId, errMsg, fetchAll, myId, useCustomerAccounts, useOwners, useQualities } from "@/lib/data";
import { NewPaymentRow as NewPaymentRowLazy } from "@/views/payments";
import { downloadExcel } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Empty, methodLabel, PageHeader, Stat } from "@/components/kit";
import { Cell, LetterRow, Sheet } from "@/components/sheet";

type Acct = Tables<"customer_accounts">;

/** Owes (positive) or advance (negative) as a coloured figure. */
export function Outstanding({ value }: { value: number }) {
  const { t } = useT();
  if (value === 0) return <span className="text-muted-foreground">0</span>;
  return value > 0
    ? <span className="font-semibold text-destructive">{fmt(value)}</span>
    : <span className="font-semibold text-success">{fmt(-value)} <span className="font-sans text-[10px]">{t("advance")}</span></span>;
}

export default function CustomersPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const accounts = useCustomerAccounts();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const all = accounts.data ?? [];
  const s = search.trim().toLowerCase();
  // Favourites first, then the rest in their usual order.
  const rows = useMemo(() => all.filter((c) => (showInactive || c.is_active) && (!s || (c.name ?? "").toLowerCase().includes(s) || (c.phone ?? "").includes(s)))
    .sort((a, b) => Number(!!b.is_favourite) - Number(!!a.is_favourite)), [all, s, showInactive]);
  const owes = all.reduce((a, c) => a + Math.max(0, Number(c.outstanding)), 0);
  const advance = all.reduce((a, c) => a + Math.max(0, -Number(c.outstanding)), 0);
  const refresh = () => qc.invalidateQueries();

  async function update(id: string, patch: Partial<Tables<"parties">>) {
    const { error } = await supabase.from("parties").update(patch).eq("id", id);
    if (error) toast.error(/unique|duplicate/i.test(error.message) ? t("duplicateCustomer") : error.message);
    refresh();
  }

  return (
    <div className="space-y-3">
      <PageHeader title={t("customerMaster")} sub={t("customerMasterHelp")} actions={
        <Button variant="outline" size="sm" onClick={() => downloadExcel("customers", [{ name: "Customers", rows: [
          ["Customer ID", "Name", "Phone", "Address", "Opening due", "Bricks bought", "Purchases", "Payments", "Outstanding (+ owes / − advance)", "Last sale", "Status"],
          ...all.map((c) => [customerId(c.ref_no), c.name, c.phone ?? "", c.address ?? "", Number(c.opening_due), Number(c.bricks), Number(c.purchases), Number(c.payments), Number(c.outstanding), c.last_sale ?? "", c.is_active ? "Active" : "Inactive"]),
        ] }])}>Excel</Button>} />

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("customersCount")} value={all.filter((c) => c.is_active).length} />
        <Stat label={t("totalOutstanding")} value={owes} money tone="bad" />
        <Stat label={t("advances")} value={advance} money tone="good" />
      </div>

      <div className="no-print flex flex-wrap items-center gap-3">
        <Input className="h-9 max-w-xs" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={showInactive} onCheckedChange={setShowInactive} />{t("showInactive")}</label>
      </div>

      <Sheet minWidth={1100}>
        <thead>
          <LetterRow cols={12} />
          <tr>
            <th className="rn">#</th><th className="w-16">{t("customerIdCol")}</th><th className="w-8" title={t("favourites")}>★</th><th className="w-48">{t("name")}</th><th className="w-32">{t("phone")}</th><th>{t("address")}</th>
            <th className="n w-28">{t("openingDue")}</th><th className="n w-24">{t("bricksCol")}</th><th className="n w-28">{t("purchases")}</th>
            <th className="n w-28">{t("paymentsCol")}</th><th className="n w-32">{t("outstandingCol")}</th><th className="w-40">{t("note")}</th><th className="w-16">{t("active")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => (
            <tr key={c.party_id} className={c.is_active ? "" : "opacity-60"}>
              <td className="rn">{i + 1}</td>
              <td className="num text-xs"><Link href={`/customers/${c.party_id}`} className="text-primary hover:underline">{customerId(c.ref_no)}</Link></td>
              <td className="px-1 text-center"><button type="button" className={`text-base ${c.is_favourite ? "text-warning" : "text-muted-foreground/50 hover:text-warning"}`}
                onClick={() => update(c.party_id!, { is_favourite: !c.is_favourite })} aria-label={c.is_favourite ? t("unmarkFavourite") : t("markFavourite")}>{c.is_favourite ? "★" : "☆"}</button></td>
              <td className="c">
                {c.is_cash ? <Link href={`/customers/${c.party_id}`} className="block px-2 font-medium">{c.name} <span className="rounded bg-success/15 px-1 text-[10px] text-success">{t("cash")}</span></Link>
                  : <Cell value={c.name ?? ""} className="font-medium" onCommit={(v) => v.trim() && update(c.party_id!, { name: v.trim() })} />}
              </td>
              <td className="c"><Cell value={c.phone ?? ""} placeholder="—" onCommit={(v) => update(c.party_id!, { phone: v.trim() || null })} /></td>
              <td className="c"><Cell value={c.address ?? ""} placeholder="—" onCommit={(v) => update(c.party_id!, { address: v.trim() || null })} /></td>
              <td className="c">{c.is_cash ? <span className="block px-2 text-end text-muted-foreground">—</span> : <Cell numeric value={String(Number(c.opening_due))}
                onCommit={(v) => { const n = parseWhole(v, true); if (n != null) update(c.party_id!, { opening_balance: -n }); }} />}</td>
              <td className="n num">{fmt(Number(c.bricks))}</td>
              <td className="n num">{fmt(Number(c.purchases))}</td>
              <td className="n num">{fmt(Number(c.payments))}</td>
              <td className="n num"><Link href={`/customers/${c.party_id}`}><Outstanding value={Number(c.outstanding)} /></Link></td>
              <td className="c"><Cell value={c.notes ?? ""} placeholder="—" onCommit={(v) => update(c.party_id!, { notes: v.trim() || null })} /></td>
              <td className="px-2">{!c.is_cash && <Switch checked={!!c.is_active} onCheckedChange={(v) => update(c.party_id!, { is_active: v })} />}</td>
            </tr>
          ))}
          <NewCustomerRow n={rows.length + 1} existing={all} onSaved={refresh} />
          <tr className="total">
            <td className="rn" /><td colSpan={6}>{t("total")}</td>
            <td className="n num">{fmt(rows.reduce((a, c) => a + Number(c.bricks), 0))}</td>
            <td className="n num">{fmt(rows.reduce((a, c) => a + Number(c.purchases), 0))}</td>
            <td className="n num">{fmt(rows.reduce((a, c) => a + Number(c.payments), 0))}</td>
            <td className="n num">{fmt(rows.reduce((a, c) => a + Number(c.outstanding), 0))}</td><td colSpan={2} />
          </tr>
        </tbody>
      </Sheet>
      {!accounts.isLoading && !rows.length && <Empty />}
      <p className="text-xs text-muted-foreground">{t("outstandingHelp")}</p>
    </div>
  );
}

function NewCustomerRow({ n, existing, onSaved }: { n: number; existing: Acct[]; onSaved: () => void }) {
  const { t } = useT();
  const blank = { name: "", phone: "", address: "", opening: "", notes: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const dup = !!f.name.trim() && existing.some((c) => (c.name ?? "").trim().toLowerCase() === f.name.trim().toLowerCase());
  async function save() {
    const name = f.name.trim();
    if (!name) return void toast.error(t("name"));
    if (dup) return void toast.error(t("duplicateCustomer"));
    setBusy(true);
    try {
      const opening = parseWhole(f.opening, true) ?? 0;
      const { error } = await supabase.from("parties").insert({
        kind: "customer", name, phone: f.phone.trim() || null, address: f.address.trim() || null, notes: f.notes.trim() || null,
        opening_balance: -opening, created_by: await myId(),
      });
      if (error) throw error;
      toast.success(`${t("saved")} — ${name}`);
      setF(blank);
      onSaved();
    } catch (e) {
      toast.error(/unique|duplicate/i.test(errMsg(e)) ? t("duplicateCustomer") : errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && f.name.trim()) { e.preventDefault(); save(); } };
  return (
    <tr className="new no-print">
      <td className="rn">{n}</td>
      <td className="text-xs text-muted-foreground">{t("new")}</td>
      <td />
      <td className={`c ${dup ? "warn" : ""}`}><input className={`cell font-medium ${dup ? "bad" : ""}`} placeholder={t("newCustomerName")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} onKeyDown={enter} title={dup ? t("duplicateCustomer") : undefined} /></td>
      <td className="c"><input className="cell" inputMode="tel" placeholder="—" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} onKeyDown={enter} /></td>
      <td className="c"><input className="cell" placeholder="—" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} onKeyDown={enter} /></td>
      <td className="c"><input className="cell n num" inputMode="numeric" placeholder="0" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value })} onKeyDown={enter} aria-label={t("openingDue")} /></td>
      <td colSpan={4} className="text-[11px] text-muted-foreground">{dup ? <span className="text-destructive">{t("duplicateCustomer")}</span> : t("openingDueHelp")}</td>
      <td className="c"><input className="cell" placeholder={t("note")} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} onKeyDown={enter} /></td>
      <td className="px-1"><Button size="sm" className="h-7" disabled={busy || !f.name.trim() || dup} onClick={save}>{t("add")}</Button></td>
    </tr>
  );
}

/** One customer's page: info, financial summary, purchase history and payments — all from the central registers. */
export function CustomerAccount({ id }: { id: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const accounts = useCustomerAccounts();
  const c = (accounts.data ?? []).find((x) => x.party_id === id);
  const lines = useSaleLinesFor(id);
  const pays = usePaymentsFor(id);
  if (!c) return <div className="p-8 text-center text-muted-foreground">{accounts.isLoading ? "…" : t("notFound")}</div>;
  const out = Number(c.outstanding);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/customers" className="no-print text-sm text-primary underline">← {t("customerMaster")}</Link>
          <h1 className="text-xl font-bold md:text-2xl">{c.name} {c.is_cash && <span className="rounded bg-success/15 px-1.5 align-middle text-xs text-success">{t("cashCustomer")}</span>}</h1>
          <div className="text-sm text-muted-foreground"><span className="num">{customerId(c.ref_no)}</span> · <span className="num">{c.phone ?? "—"}</span> · {c.address ?? "—"}</div>
        </div>
        <div className="no-print flex gap-2">
          <Link href={`/sales/new?customer=${id}`} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground">{t("newSale")}</Link>
          <Link href={`/party/${id}`} className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("statement")}</Link>
          <Button variant="outline" size="sm" className="h-9" onClick={() => window.print()}>{t("print")}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label={t("openingDue")} value={Number(c.opening_due)} money />
        <Stat label={t("bricksBought")} value={Number(c.bricks)} />
        <Stat label={t("purchases")} value={Number(c.purchases)} money />
        <Stat label={t("paymentsCol")} value={Number(c.payments)} money tone="good" />
        <Stat label={out < 0 ? t("advance") : t("outstandingCol")} value={Math.abs(out)} money tone={out > 0 ? "bad" : out < 0 ? "good" : undefined} />
      </div>
      <p className="num text-xs text-muted-foreground">{t("outstandingFormula")}: {fmt(Number(c.opening_due))} + {fmt(Number(c.purchases))} − {fmt(Number(c.payments))}{Number(c.adjustments) ? ` − ${fmt(Number(c.adjustments))}` : ""} = {fmt(out)}</p>

      <div className="text-sm font-semibold">{t("purchaseHistory")}</div>
      <Sheet minWidth={820}>
        <thead>
          <LetterRow cols={8} />
          <tr><th className="rn">#</th><th className="w-28">{t("date")}</th><th className="w-20">{t("saleIdCol")}</th><th>{t("brickType")}</th><th className="n w-28">{t("qtyCol")}</th>
            <th className="n w-28">{t("rateCol")}</th><th className="n w-28">{t("amountRs")}</th><th className="w-28">{t("vehicle")}</th><th>{t("note")}</th></tr>
        </thead>
        <tbody>
          {(lines.data ?? []).map((l, i) => (
            <tr key={l.item_id}>
              <td className="rn">{i + 1}</td><td className="num">{fmtDate(l.entry_date)}</td>
              <td className="num text-xs"><Link href={`/sales/${l.sale_id}`} className="text-primary hover:underline">{`S-${String(l.invoice_no).padStart(4, "0")}`}</Link></td>
              <td><TypeName id={l.quality_id} />{l.unit === "load" && <span className="ms-1 text-[11px] text-muted-foreground">({t("perLoad")})</span>}</td><td className="n num">{fmt(Number(l.quantity))}{l.unit === "load" ? ` ${t("loads")}` : ""}</td><td className="n num">{fmt(Number(l.rate_per_1000))}</td>
              <td className="n num font-semibold">{fmt(Number(l.amount))}</td><td>{l.vehicle_no}</td><td className="ro">{l.note}</td>
            </tr>
          ))}
          <tr className="total"><td className="rn" /><td colSpan={3}>{t("total")}</td>
            <td className="n num">{fmt((lines.data ?? []).reduce((a, l) => a + (l.unit === "load" ? 0 : Number(l.quantity)), 0))}</td><td />
            <td className="n num">{fmt((lines.data ?? []).reduce((a, l) => a + Number(l.amount), 0))}</td><td colSpan={2} /></tr>
        </tbody>
      </Sheet>

      <div className="text-sm font-semibold">{t("paymentHistory")}</div>
      <Sheet minWidth={760}>
        <thead>
          <LetterRow cols={9} />
          <tr><th className="rn">#</th><th className="w-20">{t("paymentIdCol")}</th><th className="w-36">{t("date")}</th><th>{t("customer")}</th><th className="n w-28">{t("amountRs")}</th>
            <th className="w-24">{t("method")}</th><th className="w-28">{t("referenceNo")}</th><th className="w-32">{t("receivedBy")}</th><th>{t("note")}</th><th className="no-print w-10" /></tr>
        </thead>
        <tbody>
          {(pays.data ?? []).map((x, i) => (
            <tr key={x.id}>
              <td className="rn">{i + 1}</td><td className="num text-xs">{`P-${String(x.ref_no).padStart(4, "0")}`}</td><td className="num">{fmtDate(x.entry_date)}</td>
              <td>{c.name}{x.sale_id && <span className="ms-1 text-[10px] text-muted-foreground">{t("atSale")}</span>}</td>
              <td className="n num font-semibold">{x.direction === "out" ? "−" : ""}{fmt(Number(x.amount))}</td><td>{methodLabel(t, x.method)}</td><td>{x.reference}</td><td className="text-xs"><OwnerName id={x.handler_user_id} /></td><td className="ro">{x.note}</td><td className="no-print" />
            </tr>
          ))}
          {<NewPaymentRowLazy n={(pays.data ?? []).length + 1} customers={accounts.data ?? []} fixedCustomer={id} onSaved={() => qc.invalidateQueries()} />}
          <tr className="total"><td className="rn" /><td colSpan={3}>{t("total")}</td><td className="n num">{fmt(Number(c.payments))}</td><td colSpan={5} /></tr>
        </tbody>
      </Sheet>
    </div>
  );
}


function useSaleLinesFor(id: string) {
  return useQuery({
    queryKey: ["sale-lines", "customer", id],
    queryFn: () => fetchAll<Tables<"sale_lines">>((a, b) => supabase.from("sale_lines").select("*").eq("customer_id", id).order("entry_date").order("invoice_no").range(a, b)),
  });
}
function usePaymentsFor(id: string) {
  return useQuery({
    queryKey: ["payments", "customer", id],
    queryFn: () => fetchAll<Tables<"transactions">>((a, b) => supabase.from("transactions").select("*").eq("party_id", id).eq("kind", "sale_receipt").is("deleted_at", null).order("entry_date").order("ref_no").range(a, b)),
  });
}
function TypeName({ id }: { id: string | null }) {
  const types = useQualities();
  return <>{(types.data ?? []).find((q) => q.id === id)?.name_en ?? "—"}</>;
}
function OwnerName({ id }: { id: string }) {
  const owners = useOwners();
  return <>{(owners.data ?? []).find((o) => o.id === id)?.display_name ?? "—"}</>;
}
