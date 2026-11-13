"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt, useT } from "@/lib/i18n";
import { parseWhole } from "@/lib/kiln-math";
import { errMsg, myId, seasonForDate, today, useLedgers, useParties, useSeasons, WORKER_KINDS, type PartyKind } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { BalanceBadge } from "@/components/BalanceBadge";
import { DateInput, Empty, Field, NumInput, PageHeader, Select, Stat } from "@/components/kit";
import { kindKey, OpeningInput } from "@/components/PartyLedger";

export function PartyList({ kind }: { kind: PartyKind }) {
  const { t } = useT();
  const qc = useQueryClient();
  const list = useParties(kind);
  const ledgers = useLedgers();
  const seasons = useSeasons();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const blank = { name: "", phone: "", address: "", type: "simple", openAmt: "", openDir: "we", rate: "", kharcha: "", from: today(), salary: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const isWorker = WORKER_KINDS.includes(kind);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const rate = parseWhole(f.rate), kh = parseWhole(f.kharcha), opening = (parseWhole(f.openAmt) ?? 0) * (f.openDir === "they" ? -1 : 1);
    if (isWorker && (!rate || rate <= 0)) return void toast.error(t("missingRate"));
    if (kind === "patheer" && (!kh || kh <= 0)) return void toast.error(t("kharchaRate"));
    setBusy(true);
    try {
      const uid = await myId();
      const season = seasonForDate((seasons.data ?? []).filter((s) => !s.is_closed), today()) ?? (seasons.data ?? []).find((s) => !s.is_closed);
      const { data, error } = await supabase.from("parties").insert({
        kind, name: f.name.trim(), phone: f.phone.trim() || null, address: f.address.trim() || null,
        party_type: kind === "patheer" ? f.type : null, opening_balance: opening, season_id: season?.id ?? null,
        monthly_salary: kind === "employee" ? parseWhole(f.salary) ?? 0 : 0, created_by: uid,
      }).select().single();
      if (error) throw error;
      const rates = [];
      if (isWorker && rate) rates.push({ party_id: data.id, kind: "earning" as const, rate_per_1000: rate, effective_from: f.from, created_by: uid });
      if (isWorker && kh) rates.push({ party_id: data.id, kind: "kharcha" as const, rate_per_1000: kh, effective_from: f.from, created_by: uid });
      if (rates.length) {
        const { error: e2 } = await supabase.from("party_rates").insert(rates);
        if (e2) throw e2;
      }
      setF({ ...blank, rate: f.rate, kharcha: f.kharcha, from: f.from });
      qc.invalidateQueries();
      toast.success(t("saved"));
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const bal = new Map((ledgers.data ?? []).map((l) => [l.party_id, Number(l.balance)]));
  const all = list.data ?? [];
  const s = search.trim().toLowerCase();
  const shown = all.filter((p) => (showInactive || p.is_active) && (!s || p.name.toLowerCase().includes(s) || (p.phone ?? "").includes(s)));
  const weOwe = all.reduce((acc, p) => acc + Math.max(0, bal.get(p.id) ?? 0), 0);
  const theyOwe = all.reduce((acc, p) => acc + Math.max(0, -(bal.get(p.id) ?? 0)), 0);
  const typeLabel = (x: string | null) => (x === "tile9t" ? t("tile9t") : x === "special" ? t("specialBrick") : t("simple"));

  return (
    <div className="space-y-4">
      <PageHeader title={t(kindKey(kind))} sub={`${fmt(all.filter((p) => p.is_active).length)} ${t("active")}`} />
      {kind !== "vendor" && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label={t(kind === "customer" ? "weOweCustomer" : "weOwe")} value={weOwe} money tone="warn" />
          <Stat label={t(kind === "customer" ? "customerOwes" : "heOwes")} value={theyOwe} money tone="good" />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <form onSubmit={add} className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-xl font-bold">{t("addNew")}</h2>
          <Field label={t("name")}><Input className="h-10 text-lg" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
          <Field label={t("phone")}><Input className="num h-10" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          {(kind === "customer" || kind === "vendor" || kind === "employee") && (
            <Field label={t("address")}><Input className="h-10" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          )}
          {kind === "patheer" && (
            <Field label={t("type")}><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="simple">{t("simple")}</option><option value="tile9t">{t("tile9t")}</option><option value="special">{t("specialBrick")}</option>
            </Select></Field>
          )}
          {isWorker && (<>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("rate")}><NumInput value={f.rate} onChange={(v) => setF({ ...f, rate: v })} required placeholder={kind === "patheer" ? "1600" : ""} /></Field>
              <Field label={t("kharchaRate")} hint={kind === "patheer" ? undefined : t("optional")}><NumInput value={f.kharcha} onChange={(v) => setF({ ...f, kharcha: v })} required={kind === "patheer"} placeholder={kind === "patheer" ? "1300" : ""} /></Field>
            </div>
            <Field label={t("effectiveFrom")}><DateInput value={f.from} onChange={(v) => setF({ ...f, from: v })} /></Field>
          </>)}
          {kind === "employee" && <Field label={t("monthlySalary")}><NumInput value={f.salary} onChange={(v) => setF({ ...f, salary: v })} /></Field>}
          {kind !== "vendor" && <div className="flex flex-wrap gap-2"><OpeningInput amount={f.openAmt} dir={f.openDir} kind={kind} onChange={(a, d) => setF({ ...f, openAmt: a, openDir: d })} /></div>}
          <Button size="lg" className="w-full text-lg" disabled={busy || !f.name.trim()}>{t("save")}</Button>
        </form>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input className="h-10 flex-1 text-lg" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <label className="flex items-center gap-2 text-sm"><Switch checked={showInactive} onCheckedChange={setShowInactive} />{t("showInactive")}</label>
          </div>
          {!shown.length && <Empty />}
          {shown.map((p) => (
            <Link key={p.id} href={`/party/${p.id}`} className={`flex items-center justify-between rounded-xl border bg-card p-4 hover:border-primary ${p.is_active ? "" : "opacity-60"}`}>
              <div>
                <div className="text-lg font-bold">{p.name}</div>
                <div className="text-sm text-muted-foreground">
                  {kind === "patheer" && typeLabel(p.party_type)} {kind === "employee" && `${t("monthlySalary")}: ${fmt(Number(p.monthly_salary))}`} <span className="num">{p.phone}</span>
                </div>
              </div>
              {kind !== "vendor" && (
                <div className="text-end">
                  <div className="num text-xl font-semibold">{fmt(Math.abs(bal.get(p.id) ?? 0))}</div>
                  <BalanceBadge balance={bal.get(p.id) ?? 0} kind={kind} />
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
