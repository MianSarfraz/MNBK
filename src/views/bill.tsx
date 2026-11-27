"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { billTotals, isLoad, monthStart } from "@/lib/kiln-math";
import { fetchAll, saleId, today, useCustomerAccounts, useQualities } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { BillHeader } from "@/components/BillHeader";
import { Outstanding } from "@/views/customers";
import { CustomerList, findCustomer } from "@/views/sales-register";

type Total = Tables<"sale_totals">;

/** Invoice generator: pick one or more sales (any customer) and print them as one bill under one name. */
export default function BillPage() {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const ids = useMemo(() => (params.get("ids") ?? "").split(",").filter(Boolean), [params]);
  const accounts = useCustomerAccounts();
  const customers = accounts.data ?? [];
  const qualities = useQualities();

  // ---- picker ----
  const [pickCustomer, setPickCustomer] = useState("");
  const [range, setRange] = useState({ from: monthStart(today()), to: today() });
  const pickId = findCustomer(customers, pickCustomer)?.party_id ?? "";
  const listQ = useQuery({
    queryKey: ["bill-pick", pickId, range.from, range.to],
    queryFn: () => fetchAll<Total>((a, b) => {
      let q = supabase.from("sale_totals").select("*").gte("entry_date", range.from).lte("entry_date", range.to);
      if (pickId) q = q.eq("customer_id", pickId);
      return q.order("entry_date").order("invoice_no").range(a, b);
    }),
  });
  const setIds = (next: string[]) => {
    const p = new URLSearchParams(params.toString());
    if (next.length) p.set("ids", next.join(",")); else p.delete("ids");
    router.replace(`/sales/bill${p.size ? `?${p}` : ""}`);
  };
  const toggle = (id: string) => setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  // ---- bill ----
  const billQ = useQuery({
    queryKey: ["bill", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [tot, lines, rec] = await Promise.all([
        supabase.from("sale_totals").select("*").in("sale_id", ids),
        supabase.from("sale_lines").select("*").in("sale_id", ids),
        supabase.from("transactions").select("sale_id, amount, direction").in("sale_id", ids).eq("kind", "sale_receipt").is("deleted_at", null),
      ]);
      for (const r of [tot, lines, rec]) if (r.error) throw r.error;
      return { totals: (tot.data ?? []).filter((x) => ids.includes(x.sale_id!)), lines: (lines.data ?? []).filter((x) => ids.includes(x.sale_id!)), receipts: rec.data ?? [] };
    },
  });
  const sales = (billQ.data?.totals ?? []).slice().sort((a, b) => (a.entry_date ?? "").localeCompare(b.entry_date ?? "") || Number(a.invoice_no) - Number(b.invoice_no));
  const custIds = [...new Set(sales.map((s) => s.customer_id))];
  const oneCustomer = custIds.length === 1 ? customers.find((c) => c.party_id === custIds[0]) : undefined;
  const [billTo, setBillTo] = useState<{ name: string; phone: string; address: string } | null>(null);
  const to = billTo ?? { name: oneCustomer?.name ?? "", phone: oneCustomer?.phone ?? "", address: oneCustomer?.address ?? "" };
  const received = (sid: string) => (billQ.data?.receipts ?? []).filter((r) => r.sale_id === sid).reduce((s, r) => s + (r.direction === "in" ? 1 : -1) * Number(r.amount), 0);
  const tot = billTotals(sales.map((s) => ({ total: Number(s.total), received: received(s.sale_id!) })));
  const custName = (id: string | null) => customers.find((c) => c.party_id === id)?.name ?? "—";
  const typeName = (id: string | null) => (qualities.data ?? []).find((q) => q.id === id)?.name_en ?? "—";
  const bricks = sales.reduce((s, x) => s + Number(x.bricks), 0);
  const loads = sales.reduce((s, x) => s + Number(x.loads ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="no-print space-y-3 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">{t("invoiceGenerator")}</h1>
          <div className="flex gap-2">
            <Link href="/sales" className="inline-flex h-9 items-center rounded-md border px-3 text-sm">← {t("salesRegister")}</Link>
            <Button disabled={!sales.length} onClick={() => window.print()}>{t("print")} / PDF</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{t("billHelp")}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CustomerList id="bill-customers" customers={customers} />
          <input className="h-9 min-w-48 rounded-md border bg-background px-2" list="bill-customers" placeholder={t("allCustomers")} value={pickCustomer}
            onChange={(e) => setPickCustomer(e.target.value)} aria-label={t("customer")} />
          <input type="date" className="h-9 rounded-md border bg-background px-2" value={range.from} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} aria-label={t("from")} />
          <span>→</span>
          <input type="date" className="h-9 rounded-md border bg-background px-2" value={range.to} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} aria-label={t("to")} />
          <Button variant="outline" size="sm" onClick={() => setIds([...new Set([...ids, ...(listQ.data ?? []).map((s) => s.sale_id!)])])} disabled={!(listQ.data ?? []).length}>{t("selectAll")}</Button>
          {ids.length > 0 && <Button variant="outline" size="sm" onClick={() => setIds([])}>{t("clearSelection")}</Button>}
        </div>
        <div className="max-h-64 overflow-auto rounded-md border">
          <table className="sheet">
            <tbody>
              {(listQ.data ?? []).map((s) => (
                <tr key={s.sale_id} className={ids.includes(s.sale_id!) ? "bg-primary/5" : ""}>
                  <td className="w-8 px-2"><input type="checkbox" checked={ids.includes(s.sale_id!)} onChange={() => toggle(s.sale_id!)} aria-label={saleId(s.invoice_no)} /></td>
                  <td className="num w-20 text-xs">{saleId(s.invoice_no)}</td>
                  <td className="num w-28">{fmtDate(s.entry_date)}</td>
                  <td>{custName(s.customer_id)}</td>
                  <td className="n num">{fmt(Number(s.bricks))}{Number(s.loads) ? ` + ${fmt(Number(s.loads))} ${t("loads")}` : ""}</td>
                  <td className="n num font-semibold">Rs {fmt(Number(s.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!listQ.isLoading && !(listQ.data ?? []).length && <p className="p-2 text-xs text-muted-foreground">{t("salesEmpty")}</p>}
        </div>
        {sales.length > 0 && (
          <div className="grid gap-2 md:grid-cols-3">
            <label className="grid gap-1 text-xs">{t("billTo")}<input className="h-9 rounded-md border bg-background px-2 text-sm" value={to.name} onChange={(e) => setBillTo({ ...to, name: e.target.value })} aria-label={t("billTo")} /></label>
            <label className="grid gap-1 text-xs">{t("phone")}<input className="h-9 rounded-md border bg-background px-2 text-sm" value={to.phone} onChange={(e) => setBillTo({ ...to, phone: e.target.value })} /></label>
            <label className="grid gap-1 text-xs">{t("address")}<input className="h-9 rounded-md border bg-background px-2 text-sm" value={to.address} onChange={(e) => setBillTo({ ...to, address: e.target.value })} /></label>
          </div>
        )}
      </div>

      {sales.length > 0 && (
        <article className="register-paper rounded-xl border bg-card p-4">
          <BillHeader title={sales.length > 1 ? t("combinedInvoice") : t("invoice")} right={<>
            <div className="num">{t("date")}: {fmtDate(today())}</div>
          </>} />
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-lg">
            <dt className="text-muted-foreground">{t("billTo")}</dt><dd className="font-bold">{to.name || "—"} <span className="num text-base font-normal">{to.phone}</span></dd>
            {to.address && <><dt className="text-muted-foreground">{t("address")}</dt><dd>{to.address}</dd></>}
          </dl>
          <table className="sheet mt-3">
            <thead><tr className="border-b-2 border-primary">
              <th className="text-start">{t("date")}</th>{custIds.length > 1 && <th className="text-start">{t("customer")}</th>}
              <th className="text-start">{t("brickType")}</th><th className="n">{t("qtyCol")}</th><th className="n">{t("rateCol")}</th><th className="n">{t("amountRs")}</th>
            </tr></thead>
            <tbody>
              {sales.map((s) => {
                const ls = (billQ.data?.lines ?? []).filter((l) => l.sale_id === s.sale_id);
                const extra = Number(s.delivery_charges) - Number(s.discount);
                return [
                  ...ls.map((l, i) => (
                    <tr key={l.item_id} className="border-b">
                      <td className="num">{i === 0 ? fmtDate(s.entry_date) : ""}</td>
                      {custIds.length > 1 && <td>{i === 0 ? custName(s.customer_id) : ""}</td>}
                      <td>{typeName(l.quality_id)}{isLoad(l.unit) && <span className="ms-1 text-xs text-muted-foreground">({t("perLoad")})</span>}</td>
                      <td className="n num">{fmt(Number(l.quantity))}</td>
                      <td className="n num">{Number(l.rate_per_1000) ? fmt(Number(l.rate_per_1000)) : "—"}</td>
                      <td className="n num font-semibold">{fmt(Number(l.amount))}</td>
                    </tr>
                  )),
                  extra !== 0 && (
                    <tr key={`${s.sale_id}-x`} className="border-b text-sm">
                      <td colSpan={custIds.length > 1 ? 5 : 4} className="text-end text-muted-foreground">
                        {Number(s.discount) ? `${t("discount")} − ${fmt(Number(s.discount))}` : ""}{Number(s.discount) && Number(s.delivery_charges) ? " · " : ""}{Number(s.delivery_charges) ? `${t("deliveryCharges")} + ${fmt(Number(s.delivery_charges))}` : ""}
                      </td>
                      <td className="n num">{extra > 0 ? "+" : "−"} {fmt(Math.abs(extra))}</td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
          <div className="ms-auto mt-4 max-w-sm space-y-1 text-lg">
            <div className="flex justify-between text-sm text-muted-foreground"><span>{fmt(bricks)} {t("bricks")}{loads ? ` + ${fmt(loads)} ${t("loads")}` : ""}</span><span>{sales.length} {t("salesCountShort")}</span></div>
            <div className="flex justify-between border-t-2 border-primary pt-1 text-2xl font-bold"><span>{t("invoiceTotal")}</span><span className="num">Rs {fmt(tot.total)}</span></div>
            <div className="flex justify-between text-success"><span>{t("received")}</span><span className="num">{fmt(tot.received)}</span></div>
            <div className="flex justify-between font-bold"><span>{t("balanceDue")}</span><span className="num">Rs {fmt(tot.due)}</span></div>
            {oneCustomer && <div className="flex justify-between border-t pt-1 text-sm"><span>{t("accountOutstanding")}</span><span className="num"><Outstanding value={Number(oneCustomer.outstanding)} /></span></div>}
          </div>
          <footer className="mt-8 flex justify-between text-sm text-muted-foreground">
            <span>{t("thankYou")}</span><span className="border-t border-foreground px-8 pt-1">{t("signature")}</span>
          </footer>
        </article>
      )}
      {!ids.length && <p className="no-print text-center text-sm text-muted-foreground">{t("billPickHelp")}</p>}
    </div>
  );
}
