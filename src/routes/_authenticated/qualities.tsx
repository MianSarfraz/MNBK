import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { myId } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/qualities")({
  head: () => ({ meta: [{ title: "Qualities — Mian Nawaz Bricks" }, { name: "description", content: "Brick qualities." }] }),
  component: QualitiesPage,
});

type Kind = "sale" | "nakasi";
type Cat = "normal" | "nine_t" | "special" | "other";

function QualitiesPage() {
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
    if (error) return toast.error(error.message);
    setEn(""); setUr("");
    qc.invalidateQueries({ queryKey: ["qualities"] });
  }
  async function update(id: string, patch: { is_active?: boolean; name_en?: string; name_ur?: string }) {
    const { error } = await supabase.from("qualities").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["qualities"] });
  }

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
          <option value="normal">normal</option><option value="nine_t">9T</option><option value="special">special</option><option value="other">other</option>
        </select>
        <Button size="lg">{t("add")}</Button>
      </form>
      {groups.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-xl font-bold">{g === "sale" ? t("kindSale") : t("kindNakasi")}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {(q.data ?? []).filter((x) => x.kind === g).map((x) => (
              <div key={x.id} className="flex items-center gap-2 rounded-lg border bg-card p-3">
                <Input className="h-10" defaultValue={lang === "ur" ? x.name_ur : x.name_en}
                  onBlur={(e) => { const v = e.target.value.trim(); const cur = lang === "ur" ? x.name_ur : x.name_en; if (v && v !== cur) update(x.id, lang === "ur" ? { name_ur: v } : { name_en: v }); }} />
                <span className="text-xs text-muted-foreground">{x.category}</span>
                <Switch checked={x.is_active} onCheckedChange={(v) => update(x.id, { is_active: v })} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
