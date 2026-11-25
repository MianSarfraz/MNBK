"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, useT } from "@/lib/i18n";
import { parseWhole } from "@/lib/kiln-math";
import { myId, today, useBrickTypes } from "@/lib/data";
import { PageHeader } from "@/components/kit";
import { Cell, LetterRow, Sheet } from "@/components/sheet";

/**
 * Bricks already in the yard before using the app — one row per brick type.
 * Stored as an "opening" stock entry, so production and sales never overwrite it.
 */
export default function OpeningStockPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const types = useBrickTypes();
  const q = useQuery({
    queryKey: ["opening-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_adjustments").select("*").eq("is_opening", true).is("deleted_at", null).order("entry_date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const rowFor = (qid: string) => (q.data ?? []).find((a) => a.quality_id === qid);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["opening-stock"] }); qc.invalidateQueries({ queryKey: ["finished-stock"] }); };

  async function save(qid: string, patch: { qty?: number; date?: string; note?: string }) {
    const cur = rowFor(qid);
    try {
      if (cur) {
        if (patch.qty === 0) {
          const { error } = await supabase.from("stock_adjustments").update({ deleted_at: new Date().toISOString() }).eq("id", cur.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("stock_adjustments").update({
            ...(patch.qty ? { delta: patch.qty } : {}), ...(patch.date ? { entry_date: patch.date } : {}), ...(patch.note !== undefined ? { reason: patch.note || "Opening stock" } : {}),
          }).eq("id", cur.id);
          if (error) throw error;
        }
      } else if (patch.qty && patch.qty > 0) {
        const { error } = await supabase.from("stock_adjustments").insert({
          stock: "finished", quality_id: qid, is_opening: true, delta: patch.qty, entry_date: patch.date || today(), reason: patch.note || "Opening stock", created_by: await myId(),
        });
        if (error) throw error;
      }
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const total = (types.data ?? []).reduce((s, ty) => s + Number(rowFor(ty.id)?.delta ?? 0), 0);
  return (
    <div className="space-y-3">
      <PageHeader title={t("openingStock")} sub={t("openingStockHelp")}
        actions={<Link href="/stock" className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-sm">{t("stockSummary")} →</Link>} />
      <Sheet minWidth={640} className="max-w-3xl">
        <thead>
          <LetterRow cols={4} />
          <tr><th className="rn">#</th><th>{t("brickType")}</th><th className="n w-40">{t("openingQty")}</th><th className="w-40">{t("dateOfOpening")}</th><th>{t("note")}</th></tr>
        </thead>
        <tbody>
          {(types.data ?? []).map((ty, i) => {
            const r = rowFor(ty.id);
            return (
              <tr key={ty.id}>
                <td className="rn">{i + 1}</td>
                <td className="font-semibold">{ty.name_en}</td>
                <td className="c"><Cell numeric className="font-semibold" value={r ? String(Number(r.delta)) : ""} placeholder="0" label={`${ty.name_en} ${t("openingQty")}`}
                  onCommit={(v) => { const n = parseWhole(v) ?? 0; save(ty.id, { qty: n }); }} /></td>
                <td className="c"><Cell type="date" value={r?.entry_date ?? ""} disabled={!r} onCommit={(v) => v && save(ty.id, { date: v })} /></td>
                <td className="c"><Cell value={r && r.reason !== "Opening stock" ? r.reason : ""} placeholder="—" disabled={!r} onCommit={(v) => save(ty.id, { note: v.trim() })} /></td>
              </tr>
            );
          })}
          <tr className="total"><td className="rn" /><td>{t("total")}</td><td className="n num">{fmt(total)}</td><td colSpan={2} /></tr>
        </tbody>
      </Sheet>
      <p className="text-xs text-muted-foreground">{t("openingStockNote")}</p>
    </div>
  );
}
