import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, useT } from "@/lib/i18n";
import { generateWeeks } from "@/lib/kiln-math";
import { myId, useSeasons, useWeeks } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmButton } from "@/components/ConfirmButton";

export const Route = createFileRoute("/_authenticated/seasons")({
  head: () => ({ meta: [{ title: "Seasons — Mian Nawaz Bricks" }, { name: "description", content: "Seasons and weeks." }] }),
  component: SeasonsPage,
});

function SeasonsPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const seasons = useSeasons();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [sel, setSel] = useState<string>();
  const weeks = useWeeks(sel);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const uid = await myId();
      const { data, error } = await supabase.from("seasons").insert({ name, start_date: start, end_date: end, created_by: uid }).select().single();
      if (error) throw error;
      const rows = generateWeeks(start, end).map((w) => ({ ...w, season_id: data.id, created_by: uid }));
      const { error: e2 } = await supabase.from("weeks").insert(rows);
      if (e2) throw e2;
      toast.success(`${rows.length} ${t("weeks")}`);
      setName(""); setStart(""); setEnd("");
      qc.invalidateQueries({ queryKey: ["seasons"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function toggleClose(id: string, closed: boolean) {
    const { error } = await supabase.from("seasons").update({ is_closed: !closed }).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["seasons"] });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={create} className="space-y-4 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold">{t("add")} {t("season")}</h2>
        <div><Label>{t("name")}</Label><Input className="h-12 text-lg" value={name} onChange={(e) => setName(e.target.value)} required placeholder="2026-27" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>{t("start")}</Label><Input className="h-12" type="date" value={start} onChange={(e) => setStart(e.target.value)} required /></div>
          <div><Label>{t("end")}</Label><Input className="h-12" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
        </div>
        <Button size="lg" className="w-full text-lg">{t("generateWeeks")}</Button>
      </form>
      <div className="space-y-3">
        {(seasons.data ?? []).map((s) => (
          <div key={s.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <button className="text-start" onClick={() => setSel(sel === s.id ? undefined : s.id)}>
                <div className="text-lg font-bold">{s.name}</div>
                <div className="num text-sm text-muted-foreground">{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</div>
              </button>
              <span className={s.is_closed ? "text-destructive" : "text-success"}>{s.is_closed ? t("closed") : t("open")}</span>
              <ConfirmButton size="sm" variant="outline" description={s.is_closed ? t("reopen") : t("close")} onConfirm={() => toggleClose(s.id, s.is_closed)}>
                {s.is_closed ? t("reopen") : t("close")}
              </ConfirmButton>
            </div>
            {sel === s.id && (
              <div className="mt-3 grid grid-cols-2 gap-1 text-sm md:grid-cols-3">
                {(weeks.data ?? []).map((w) => (
                  <div key={w.id} className="num rounded bg-muted px-2 py-1">#{w.week_number} {fmtDate(w.start_date).slice(0, 5)}→{fmtDate(w.end_date).slice(0, 5)}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
