"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { addDays, kilnByWeek, weekStart } from "@/lib/kiln-math";
import { fetchAll, today, useQualities } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { LetterRow, Sheet } from "@/components/sheet";

const RANGES = [8, 12, 26, 0] as const; // 0 = all time

/** Week by week: kacha bricks / 9t tiles rehra put into the kiln, and pakki bricks / 9t tiles nakasi took out. */
export function KilnWeeklyTable({ selectedWeek, onPick }: { selectedWeek?: string; onPick?: (week: string) => void }) {
  const { t } = useT();
  const [weeks, setWeeks] = useState<(typeof RANGES)[number]>(12);
  const from = weeks ? addDays(weekStart(today()), -7 * (weeks - 1)) : "1900-01-01";
  const qualities = useQualities();
  const q = useQuery({
    queryKey: ["kiln-weekly", from],
    queryFn: () => fetchAll<{ stage: string; entry_date: string; count: number; raw_type: string; from_store: boolean; quality_id: string | null }>((a, b) =>
      supabase.from("kiln_entries").select("stage, entry_date, count, raw_type, from_store, quality_id").is("deleted_at", null)
        .gte("entry_date", from).order("entry_date").order("id").range(a, b)),
  });
  const nineT = new Set((qualities.data ?? []).filter((x) => x.category === "nine_t").map((x) => x.id));
  const rows = kilnByWeek(q.data ?? [], (id) => !!id && nineT.has(id));
  const sum = (k: "inBricks" | "in9t" | "inStore" | "outBricks" | "out9t") => rows.reduce((s, r) => s + r[k], 0);
  const label = (w: string) => `${fmtDate(w)} → ${fmtDate(addDays(w, 6))}`;

  function exportXls() {
    downloadExcel(`kiln-weekly-${today()}`, [{ name: "Kiln in-out by week", rows: [
      ["Week (Thu–Wed)", "Rehra in: bricks", "Rehra in: 9t tiles", "of which from kacha store", "Nakasi out: bricks", "Nakasi out: 9t tiles"],
      ...rows.map((r) => [label(r.week), r.inBricks, r.in9t, r.inStore, r.outBricks, r.out9t]),
      [], ["Total", sum("inBricks"), sum("in9t"), sum("inStore"), sum("outBricks"), sum("out9t")],
    ] }]);
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{t("kilnWeekly")}</div>
        <div className="no-print flex items-center gap-1 text-xs">
          {RANGES.map((n) => (
            <button key={n} type="button" onClick={() => setWeeks(n)}
              className={`rounded-md border px-2 py-1 ${weeks === n ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>
              {n ? `${n} ${t("weeksShort")}` : t("allTime")}
            </button>
          ))}
          <Button variant="outline" size="sm" className="h-7" onClick={exportXls}>Excel</Button>
          <Link href="/gair" className="rounded-md border bg-card px-2 py-1">{t("gairCheck")}</Link>
        </div>
      </div>
      <Sheet minWidth={760}>
        <thead>
          <LetterRow cols={7} />
          <tr>
            <th className="rn" rowSpan={2}>#</th><th rowSpan={2} className="w-48">{t("weekCol")}</th>
            <th colSpan={3} className="text-center">{t("rehraIn")}</th><th colSpan={2} className="text-center">{t("nakasiOut")}</th>
          </tr>
          <tr>
            <th className="n">{t("rawBrick")}</th><th className="n">{t("raw9t")}</th><th className="n">{t("inStoreShort")}</th>
            <th className="n">{t("rawBrick")}</th><th className="n">{t("raw9t")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.week} className={r.week === selectedWeek ? "bg-primary/5 font-semibold" : ""}>
              <td className="rn">{i + 1}</td>
              <td className="num text-xs">{onPick
                ? <button type="button" className="text-primary hover:underline" onClick={() => onPick(r.week)}>{label(r.week)}</button>
                : label(r.week)}</td>
              <td className="n num">{fmt(r.inBricks)}</td>
              <td className="n num">{fmt(r.in9t)}</td>
              <td className="n num ro">{r.inStore ? fmt(r.inStore) : ""}</td>
              <td className="n num">{fmt(r.outBricks)}</td>
              <td className="n num">{fmt(r.out9t)}</td>
            </tr>
          ))}
          <tr className="total">
            <td className="rn" /><td>{t("total")}</td>
            <td className="n num">{fmt(sum("inBricks"))}</td><td className="n num">{fmt(sum("in9t"))}</td><td className="n num">{fmt(sum("inStore"))}</td>
            <td className="n num">{fmt(sum("outBricks"))}</td><td className="n num">{fmt(sum("out9t"))}</td>
          </tr>
        </tbody>
      </Sheet>
      {!q.isLoading && !rows.length && <p className="text-xs text-muted-foreground">{t("kilnWeeklyEmpty")}</p>}
    </div>
  );
}
