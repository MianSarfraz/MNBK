"use client";

import Link from "next/link";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { gairCheck } from "@/lib/kiln-math";
import { useGairs } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Empty, PageHeader, PrintHeader } from "@/components/kit";
import { KachaStoreCards } from "@/components/KachaStore";
import { LetterRow, Sheet } from "@/components/sheet";

/** Gair check: kacha bricks loaded into each gair (fresh + from the kacha store) vs pakki bricks out, per kind. */
export default function GairPage() {
  const { t } = useT();
  const q = useGairs();
  const all = q.data ?? [];
  const rows = all.filter((g) => g.gair_key);
  const unassigned = all.find((g) => !g.gair_key);
  const noGairLoads = Number(unassigned?.loaded_bricks ?? 0) + Number(unassigned?.loaded_9t ?? 0);

  function exportXls() {
    downloadExcel("gair-check", [{ name: "Gair check", rows: [
      ["Gair", "From", "To", "Kacha bricks in", "of which from store", "Pakki bricks out", "Difference", "Kacha 9t in", "Pakki 9t out", "Difference (9t)"],
      ...rows.map((g) => [g.gair ?? "", g.first_date ?? "", g.last_date ?? "", Number(g.loaded_bricks), Number(g.loaded_from_store), Number(g.produced_bricks), Number(g.diff_bricks), Number(g.loaded_9t), Number(g.produced_9t), Number(g.diff_9t)]),
    ] }]);
  }

  return (
    <div className="space-y-3">
      <PrintHeader title={t("gairCheck")} />
      <PageHeader title={t("gairCheck")} sub={t("gairHelp")} actions={<>
        <Link href="/rehra" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("rehraKhatta")}</Link>
        <Link href="/production" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("productionRegister")}</Link>
        <Button variant="outline" size="sm" onClick={exportXls}>Excel</Button>
      </>} />

      <Sheet minWidth={980}>
        <thead>
          <LetterRow cols={10} />
          <tr>
            <th className="rn" rowSpan={2}>#</th><th rowSpan={2}>{t("firingRef")}</th><th rowSpan={2} className="w-40">{t("date")}</th>
            <th colSpan={4} className="text-center">{t("rawBrick")}</th><th colSpan={3} className="text-center">{t("raw9t")}</th>
          </tr>
          <tr>
            <th className="n w-28">{t("kachaIn")}</th><th className="n w-24">{t("inStoreShort")}</th><th className="n w-28">{t("pakkiOut")}</th><th className="n w-32">{t("difference")}</th>
            <th className="n w-28">{t("kachaIn")}</th><th className="n w-28">{t("pakkiOut")}</th><th className="n w-32">{t("difference")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g, i) => (
            <tr key={g.gair_key}>
              <td className="rn">{i + 1}</td>
              <td className="font-semibold">{g.gair}</td>
              <td className="num text-xs">{fmtDate(g.first_date)}{g.last_date !== g.first_date ? ` → ${fmtDate(g.last_date)}` : ""}</td>
              <td className="n num">{fmt(Number(g.loaded_bricks))}</td>
              <td className="n num ro">{Number(g.loaded_from_store) ? fmt(Number(g.loaded_from_store)) : ""}</td>
              <td className="n num">{fmt(Number(g.produced_bricks))}</td>
              <Diff loaded={Number(g.loaded_bricks)} produced={Number(g.produced_bricks)} />
              <td className="n num">{fmt(Number(g.loaded_9t))}</td>
              <td className="n num">{fmt(Number(g.produced_9t))}</td>
              <Diff loaded={Number(g.loaded_9t)} produced={Number(g.produced_9t)} />
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="total">
              <td className="rn" /><td colSpan={2}>{t("total")}</td>
              {(["loaded_bricks", "loaded_from_store", "produced_bricks", "diff_bricks", "loaded_9t", "produced_9t", "diff_9t"] as const).map((k) => (
                <td key={k} className="n num">{fmt(rows.reduce((s, g) => s + Number(g[k]), 0))}</td>
              ))}
            </tr>
          )}
        </tbody>
      </Sheet>
      {!q.isLoading && !rows.length && <Empty>{t("gairEmpty")}</Empty>}

      {noGairLoads > 0 && (
        <div className="rounded-md border border-warning bg-warning/10 p-2 text-sm">
          <b>{t("noGairLoads")}:</b> <span className="num">{fmt(Number(unassigned?.loaded_bricks ?? 0))} {t("rawBrick").toLowerCase()}{Number(unassigned?.loaded_9t) ? `, ${fmt(Number(unassigned?.loaded_9t))} ${t("raw9t")}` : ""}</span>
          {Number(unassigned?.produced_bricks) + Number(unassigned?.produced_9t) > 0 && <span className="num"> · {t("pakkiOut")} {fmt(Number(unassigned?.produced_bricks) + Number(unassigned?.produced_9t))}</span>}
          <div className="text-xs text-muted-foreground">{t("noGairLoadsHelp")}</div>
        </div>
      )}

      <div className="space-y-1">
        <div className="text-sm font-semibold">{t("unusedInStore")}</div>
        <KachaStoreCards />
      </div>
    </div>
  );
}

function Diff({ loaded, produced }: { loaded: number; produced: number }) {
  const { t } = useT();
  const g = gairCheck(loaded, produced);
  if (g.status === "empty") return <td />;
  if (g.status === "equal") return <td className="n text-xs font-semibold text-success">✓ {t("gairEqual")}</td>;
  return (
    <td className={`n num ${g.status === "over" ? "warn" : ""}`}>
      <span className={`font-semibold ${g.status === "short" ? "text-destructive" : ""}`}>{fmt(Math.abs(g.difference))}</span>
      <span className="ms-1 font-sans text-[10px] text-muted-foreground">{g.status === "short" ? `${t("gairShort")} ${(g.lossPermille / 10).toFixed(1)}%` : t("gairOver")}</span>
    </td>
  );
}
