"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { myId } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Kind = "sale" | "nakasi";
type Cat = "normal" | "nine_t" | "special" | "other";

export default function QualitiesPage() {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["qualities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("qualities").select("*").is("deleted_at", null).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [en, setEn] = useState("");
  const [ur, setUr] = useState("");
  const [kind, setKind] = useState<Kind>("sale");
  const [cat, setCat] = useState<Cat>("normal");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("qualities").insert({ name_en: en, name_ur: ur, kind, category: cat, sort_order: 100, created_by: await myId() });
    if (error) return void toast.error(error.message);
    setEn(""); setUr("");
    qc.invalidateQueries({ queryKey: ["qualities"] });
  }
  async function update(id: string, patch: { is_active?: boolean; name_en?: string; name_ur?: string; category?: Cat; stock_quality_id?: string | null }) {
    const { error } = await supabase.from("qualities").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["qualities"] });
    qc.invalidateQueries({ queryKey: ["finished-stock"] });
  }
  const nakasiQ = (q.data ?? []).filter((x) => x.kind === "nakasi");
  const catLabel: Record<Cat, string> = { normal: t("catNormal"), nine_t: t("cat9t"), special: t("catSpecial"), other: t("catOther") };

  const groups: Kind[] = ["sale", "nakasi"];
  return (
    <div className="space-y-6">
      <form onSubmit={add} className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
        <Input className="h-11 w-40" placeholder="English" value={en} onChange={(e) => setEn(e.target.value)} required />
        <Input className="h-11 w-40" placeholder="اردو" value={ur} onChange={(e) => setUr(e.target.value)} required />
        <select className="h-11 rounded-md border bg-background px-2" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="sale">{t("kindSale")}</option><option value="nakasi">{t("kindNakasi")}</option>
        </select>
        <select className="h-11 rounded-md border bg-background px-2" value={cat} onChange={(e) => setCat(e.target.value as Cat)}>
          {(Object.keys(catLabel) as Cat[]).map((c) => <option key={c} value={c}>{catLabel[c]}</option>)}
        </select>
        <Button size="lg">{t("add")}</Button>
      </form>
      <p className="text-sm text-muted-foreground">{t("stockFromHelp")}</p>
      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-xl font-bold">{g === "sale" ? t("kindSale") : t("kindNakasi")}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {(q.data ?? []).filter((x) => x.kind === g).map((x) => (
              <div key={x.id} className={`flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 ${x.is_active ? "" : "opacity-60"}`}>
                <Input className="h-10 min-w-32 flex-1" defaultValue={lang === "ur" ? x.name_ur : x.name_en}
                  onBlur={(e) => { const v = e.target.value.trim(); const cur = lang === "ur" ? x.name_ur : x.name_en; if (v && v !== cur) update(x.id, lang === "ur" ? { name_ur: v } : { name_en: v }); }} />
                <select className="h-10 rounded-md border bg-background px-1 text-sm" value={x.category} onChange={(e) => update(x.id, { category: e.target.value as Cat })}>
                  {(Object.keys(catLabel) as Cat[]).map((c) => <option key={c} value={c}>{catLabel[c]}</option>)}
                </select>
                <Switch checked={x.is_active} onCheckedChange={(v) => update(x.id, { is_active: v })} />
                {g === "sale" && (
                  <label className="flex w-full items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{t("stockFrom")}</span>
                    <select className={`h-9 flex-1 rounded-md border bg-background px-1 ${x.stock_quality_id ? "" : "border-warning"}`} value={x.stock_quality_id ?? ""} onChange={(e) => update(x.id, { stock_quality_id: e.target.value || null })}>
                      <option value="">{t("notTracked")}</option>
                      {nakasiQ.map((n) => <option key={n.id} value={n.id}>{lang === "ur" ? n.name_ur : n.name_en}</option>)}
                    </select>
                  </label>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
