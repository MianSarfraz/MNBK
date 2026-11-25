"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { useQualities } from "@/lib/data";
import { AddBrickType } from "@/components/AddBrickType";
import { PageHeader, Section } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Cat = "normal" | "nine_t" | "special" | "other";
type Patch = { is_active?: boolean; name_en?: string; name_ur?: string; category?: Cat; stock_quality_id?: string | null; kind?: "nakasi"; sort_order?: number };

export default function QualitiesPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const q = useQualities();
  const all = q.data ?? [];
  const types = all.filter((x) => x.kind === "nakasi").sort((a, b) => a.sort_order - b.sort_order);
  const retired = all.filter((x) => x.kind === "sale");
  const catLabel: Record<Cat, string> = { normal: t("catNormal"), nine_t: t("cat9t"), special: t("catSpecial"), other: t("catOther") };

  async function update(id: string, patch: Patch) {
    const { error } = await supabase.from("qualities").update(patch).eq("id", id);
    if (error) toast.error(error.message.includes("qualities_unique_name") ? "That name already exists" : error.message);
    qc.invalidateQueries({ queryKey: ["qualities"] });
    qc.invalidateQueries({ queryKey: ["finished-stock"] });
  }
  async function move(i: number, dir: -1 | 1) {
    const a = types[i], b = types[i + dir];
    if (!a || !b) return;
    // Renumber the whole list so equal sort_orders never leave the order stuck.
    const order = types.map((x) => x.id);
    [order[i], order[i + dir]] = [order[i + dir]!, order[i]!];
    await Promise.all(order.map((id, n) => (types.find((x) => x.id === id)!.sort_order !== n + 1 ? supabase.from("qualities").update({ sort_order: n + 1 }).eq("id", id) : null)));
    qc.invalidateQueries({ queryKey: ["qualities"] });
    qc.invalidateQueries({ queryKey: ["finished-stock"] });
  }
  function makeBrickType(id: string, name: string) {
    if (types.some((x) => x.name_en.trim().toLowerCase() === name.trim().toLowerCase())) return void toast.error(`"${name}" already exists`);
    update(id, { kind: "nakasi", stock_quality_id: null, is_active: true, sort_order: types.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1 });
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("kindNakasi")} sub={t("brickTypesHelp")} />
      <AddBrickType className="rounded-xl border bg-card p-3" />

      <div className="space-y-2">
        {types.map((x, i) => (
          <div key={x.id} className={`flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 ${x.is_active ? "" : "opacity-60"}`}>
            <span className="w-6 text-center text-sm text-muted-foreground">{i + 1}</span>
            <Input key={x.name_en} className="h-10 min-w-32 flex-1" defaultValue={x.name_en}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== x.name_en) update(x.id, { name_en: v, name_ur: v }); }} />
            <select className="h-10 rounded-md border bg-background px-1 text-sm" value={x.category} onChange={(e) => update(x.id, { category: e.target.value as Cat })}>
              {(Object.keys(catLabel) as Cat[]).map((c) => <option key={c} value={c}>{catLabel[c]}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("moveUp")}>↑</Button>
            <Button size="sm" variant="outline" disabled={i === types.length - 1} onClick={() => move(i, 1)} aria-label={t("moveDown")}>↓</Button>
            <Switch checked={x.is_active} onCheckedChange={(v) => update(x.id, { is_active: v })} aria-label={x.is_active ? t("active") : t("inactive")} />
          </div>
        ))}
      </div>

      {retired.length > 0 && (
        <Section title={t("kindSale")}>
          <p className="mb-2 text-sm text-muted-foreground">{t("retiredHelp")}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {retired.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-sm">
                <span className="min-w-24 flex-1 font-semibold">{x.name_en}</span>
                <span className="text-muted-foreground">{t("stockFrom")}</span>
                <select className={`h-9 rounded-md border bg-background px-1 ${x.stock_quality_id ? "" : "border-warning"}`} value={x.stock_quality_id ?? ""}
                  onChange={(e) => update(x.id, { stock_quality_id: e.target.value || null })}>
                  <option value="">{t("notTracked")}</option>
                  {types.map((n) => <option key={n.id} value={n.id}>{n.name_en}</option>)}
                </select>
                {!x.stock_quality_id && <Button size="sm" variant="outline" onClick={() => makeBrickType(x.id, x.name_en)}>{t("makeBrickType")}</Button>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
