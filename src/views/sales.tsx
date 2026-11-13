"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { monthEnd, monthStart } from "@/lib/kiln-math";
import { fetchAll, today, useParties } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput, Empty, Field, PageHeader, PrintHeader, Stat } from "@/components/kit";

export default function SalesList() {
  const { t } = useT();
  const customers = useParties("customer");
  const [range, setRange] = useState({ from: monthStart(today()), to: monthEnd(today()) });
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["sales", range.from, range.to],
    queryFn: async () => {
      const totals = await fetchAll<Tables<"sale_totals">>((a, b) => supabase.from("sale_totals").select("*").gte("entry_date", range.from).lte("entry_date", range.to).order("invoice_no", { ascending: false }).range(a, b));
      const ids = totals.map((s) => s.sale_id!);
      const [sales, rec] = await Promise.all([
        ids.length ? supabase.from("sales").select("id, vehicle_no, driver_name").in("id", ids) : Promise.resolve({ data: [], error: null }),
        ids.length ? supabase.from("transactions").select("sale_id, amount, direction").in("sale_id", ids).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
      ]);
      if (sales.error) throw sales.error;
      if (rec.error) throw rec.error;
      return totals.map((s) => ({
        ...s,
        info: (sales.data ?? []).find((x) => x.id === s.sale_id),
        paidNow: (rec.data ?? []).filter((r) => r.sale_id === s.sale_id).reduce((acc, r) => acc + (r.direction === "in" ? 1 : -1) * Number(r.amount), 0),
      }));
    },
  });
  const cName = (id: string | null) => (customers.data ?? []).find((c) => c.id === id)?.name ?? "—";
  const s = search.trim().toLowerCase();
  const rows = (q.data ?? []).filter((r) => !s || cName(r.customer_id).toLowerCase().includes(s) || String(r.invoice_no).includes(s) || (r.info?.vehicle_no ?? "").toLowerCase().includes(s));
  const total = rows.reduce((a, r) => a + Number(r.total), 0);
  const bricks = rows.reduce((a, r) => a + Number(r.bricks), 0);
  const paid = rows.reduce((a, r) => a + r.paidNow, 0);

  return (
    <div className="space-y-4">
      <PrintHeader title={t("sales")} sub={`${fmtDate(range.from)} → ${fmtDate(range.to)}`} />
      <PageHeader title={t("sales")} actions={<>
        <Link href="/sales/new" className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-lg text-primary-foreground">{t("newSale")}</Link>
        <Link href="/people/customer" className="inline-flex h-10 items-center rounded-md border bg-card px-4">{t("customers")}</Link>
        <Button variant="outline" onClick={() => downloadExcel(`sales-${range.from}-${range.to}`, [{ name: "Sales", rows: [
          ["Invoice", "Date", "Customer", "Vehicle", "Driver", "Bricks", "Gross", "Discount", "Delivery", "Total", "Received with invoice"],
          ...rows.map((r) => [r.invoice_no, r.entry_date, cName(r.customer_id), r.info?.vehicle_no ?? "", r.info?.driver_name ?? "", Number(r.bricks), Number(r.gross), Number(r.discount), Number(r.delivery_charges), Number(r.total), r.paidNow]),
        ] }])}>Excel</Button>
      </>} />
      <div className="no-print flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <Field label={t("from")}><DateInput value={range.from} onChange={(v) => setRange({ ...range, from: v })} /></Field>
        <Field label={t("to")}><DateInput value={range.to} onChange={(v) => setRange({ ...range, to: v })} /></Field>
        <Field label={t("search")} className="min-w-48 flex-1"><Input className="h-10" value={search} onChange={(e) => setSearch(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("bricksSold")} value={bricks} />
        <Stat label={t("salesTotal")} value={total} money />
        <Stat label={t("receivedWithInvoice")} value={paid} money tone="good" />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary"><tr>
            <th className="p-2 text-start">#</th><th className="p-2 text-start">{t("date")}</th><th className="p-2 text-start">{t("customer")}</th>
            <th className="p-2 text-start">{t("vehicle")}</th><th className="p-2">{t("bricks")}</th><th className="p-2">{t("total")}</th><th className="p-2">{t("received")}</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sale_id} className="border-t hover:bg-muted/40">
                <td className="num p-2"><Link href={`/sales/${r.sale_id!}`} className="text-primary underline">{fmt(Number(r.invoice_no))}</Link></td>
                <td className="num p-2">{fmtDate(r.entry_date)}</td>
                <td className="p-2"><Link href={`/party/${r.customer_id!}`} className="hover:underline">{cName(r.customer_id)}</Link></td>
                <td className="num p-2">{r.info?.vehicle_no}</td>
                <td className="num p-2 text-center">{fmt(Number(r.bricks))}</td>
                <td className="num p-2 text-center font-semibold">{fmt(Number(r.total))}</td>
                <td className="num p-2 text-center text-success">{r.paidNow ? fmt(r.paidNow) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="p-4"><Empty /></div>}
      </div>
    </div>
  );
}
