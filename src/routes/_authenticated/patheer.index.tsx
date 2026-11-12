import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, useT } from "@/lib/i18n";
import { myId, today, useLedgers, usePatheers, useSeasons } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BalanceBadge } from "@/components/BalanceBadge";

export const Route = createFileRoute("/_authenticated/patheer/")({
  head: () => ({ meta: [{ title: "Patheer — Mian Nawaz Bricks" }, { name: "description", content: "Patheer list and balances." }] }),
  component: PatheerList,
});

function PatheerList() {
  const { t } = useT();
  const qc = useQueryClient();
  const list = usePatheers();
  const ledgers = useLedgers();
  const seasons = useSeasons();
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ name: "", phone: "", type: "simple", opening: "0", rate: "", kharcha: "", from: today() });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const rate = parseInt(f.rate, 10), kh = parseInt(f.kharcha, 10), opening = parseInt(f.opening || "0", 10);
    if (!Number.isInteger(rate) || !Number.isInteger(kh) || !Number.isInteger(opening)) return void toast.error("Whole numbers only");
    try {
      const uid = await myId();
      const season = (seasons.data ?? []).find((s) => !s.is_closed);
      const { data, error } = await supabase.from("parties").insert({
        kind: "patheer", name: f.name.trim(), phone: f.phone || null, party_type: f.type, opening_balance: opening, season_id: season?.id ?? null, created_by: uid,
      }).select().single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("party_rates").insert([
        { party_id: data.id, kind: "earning", rate_per_1000: rate, effective_from: f.from, created_by: uid },
        { party_id: data.id, kind: "kharcha", rate_per_1000: kh, effective_from: f.from, created_by: uid },
      ]);
      if (e2) throw e2;
      setF({ ...f, name: "", phone: "", opening: "0" });
      qc.invalidateQueries();
      toast.success(t("save"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const bal = new Map((ledgers.data ?? []).map((l) => [l.party_id, Number(l.balance)]));
  const shown = (list.data ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const typeLabel = (x: string | null) => (x === "tile9t" ? t("tile9t") : x === "special" ? t("specialBrick") : t("simple"));

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form onSubmit={add} className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="text-xl font-bold">{t("add")} {t("patheer")}</h2>
        <div><Label>{t("name")}</Label><Input className="h-12 text-lg" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
        <div><Label>{t("phone")}</Label><Input className="h-12 num" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div><Label>{t("type")}</Label>
          <select className="h-12 w-full rounded-md border bg-background px-2 text-lg" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="simple">{t("simple")}</option><option value="tile9t">{t("tile9t")}</option><option value="special">{t("specialBrick")}</option>
          </select></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>{t("rate")}</Label><Input className="h-12 num text-lg" inputMode="numeric" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/\D/g, "") })} required placeholder="1600" /></div>
          <div><Label>{t("kharchaRate")}</Label><Input className="h-12 num text-lg" inputMode="numeric" value={f.kharcha} onChange={(e) => setF({ ...f, kharcha: e.target.value.replace(/\D/g, "") })} required placeholder="1300" /></div>
        </div>
        <div><Label>{t("effectiveFrom")}</Label><Input className="h-12" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} required /></div>
        <div><Label>{t("opening")}</Label><Input className="h-12 num text-lg" inputMode="numeric" value={f.opening} onChange={(e) => setF({ ...f, opening: e.target.value.replace(/[^\d-]/g, "") })} />
          <p className="mt-1 text-xs text-muted-foreground">{t("openingHelp")}</p></div>
        <Button size="lg" className="w-full text-lg">{t("save")}</Button>
      </form>
      <div className="space-y-3">
        <Input className="h-12 text-lg" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        {shown.map((p) => (
          <Link key={p.id} to="/patheer/$id" params={{ id: p.id }} className="flex items-center justify-between rounded-xl border bg-card p-4 hover:border-primary">
            <div>
              <div className="text-lg font-bold">{p.name}</div>
              <div className="text-sm text-muted-foreground">{typeLabel(p.party_type)} <span className="num">{p.phone}</span></div>
            </div>
            <div className="text-end">
              <div className="num text-xl font-semibold">{fmt(Math.abs(bal.get(p.id) ?? 0))}</div>
              <BalanceBadge balance={bal.get(p.id) ?? 0} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
