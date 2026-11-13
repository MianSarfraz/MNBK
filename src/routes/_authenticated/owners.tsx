import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, fmtDate, useT } from "@/lib/i18n";
import { brothersSettlement, ownerPosition, parseWhole, type OwnerTxn, type TxnKind } from "@/lib/kiln-math";
import { errMsg, fetchAll, myId, today, useOwners, useParties, useSeasons } from "@/lib/data";
import { txnKindLabel } from "@/lib/labels";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DateInput, Empty, Field, methodLabel, NumInput, OwnerSelect, PageHeader, Section, Select, Stat } from "@/components/kit";

export const Route = createFileRoute("/_authenticated/owners")({
  head: () => ({ meta: [{ title: "Owners — Mian Nawaz Bricks" }, { name: "description", content: "Each brother's payments, receipts, net position and cash in hand." }] }),
  component: OwnersPage,
});

type Txn = Tables<"transactions">;
const toOwnerTxn = (x: Txn): OwnerTxn => ({ kind: x.kind as TxnKind, direction: x.direction, amount: Number(x.amount), method: x.method, handler_user_id: x.handler_user_id, to_user_id: x.to_user_id });

function OwnersPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const owners = useOwners();
  const seasons = useSeasons();
  const parties = useParties();
  const [seasonId, setSeasonId] = useState("");
  const [sel, setSel] = useState("");
  const txQ = useQuery({
    queryKey: ["transactions", "all"],
    queryFn: () => fetchAll<Txn>((a, b) => supabase.from("transactions").select("*").is("deleted_at", null).order("entry_date").order("created_at").range(a, b)),
  });
  const countsQ = useQuery({
    queryKey: ["cash-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cash_counts").select("*").is("deleted_at", null).order("entry_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const season = (seasons.data ?? []).find((s) => s.id === seasonId);
  const all = useMemo(() => txQ.data ?? [], [txQ.data]);
  const inPeriod = useMemo(() => (season ? all.filter((x) => x.entry_date >= season.start_date && x.entry_date <= season.end_date) : all), [all, season]);
  const list = useMemo(() => owners.data ?? [], [owners.data]);
  const positions = useMemo(() => list.map((o) => ({ o, p: ownerPosition(inPeriod.map(toOwnerTxn), o.id) })), [list, inPeriod]);
  const settle = positions.length === 2 ? brothersSettlement(positions[0]!.p.net, positions[1]!.p.net) : null;
  const selected = sel || list[0]?.id || "";
  const ownerTx = inPeriod.filter((x) => x.handler_user_id === selected || x.to_user_id === selected).slice().reverse();
  const ownerName = (id: string | null) => list.find((o) => o.id === id)?.display_name ?? "—";
  const partyName = (id: string | null) => (parties.data ?? []).find((p) => p.id === id)?.name;
  // Expected cash in hand on a date = all cash movements up to and including that date.
  const expectedCash = (ownerId: string, date: string) => ownerPosition(all.filter((x) => x.entry_date <= date).map(toOwnerTxn), ownerId).cashInHand;

  const [cc, setCc] = useState({ owner: "", date: today(), counted: "", note: "" });
  async function saveCount() {
    const counted = parseWhole(cc.counted);
    if (counted == null || counted < 0) return void toast.error(t("wholeRupees"));
    if (!cc.owner) return void toast.error(t("owner"));
    try {
      const { error } = await supabase.from("cash_counts").insert({ owner_user_id: cc.owner, entry_date: cc.date, counted, note: cc.note.trim() || null, created_by: await myId() });
      if (error) throw error;
      toast.success(t("saved"));
      setCc({ ...cc, counted: "", note: "" });
      qc.invalidateQueries({ queryKey: ["cash-counts"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }
  async function voidCount(id: string) {
    const { error } = await supabase.from("cash_counts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["cash-counts"] });
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t("ownersTitle")} sub={t("ownersHelp")}
        actions={<Field label={t("period")} className="w-56"><Select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          <option value="">{t("allTime")}</option>{(seasons.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select></Field>} />

      <div className="grid gap-4 md:grid-cols-2">
        {positions.map(({ o, p }) => (
          <Section key={o.id} title={o.display_name}>
            <div className="grid grid-cols-2 gap-3">
              <Stat label={t("receivedTotal")} value={p.received} money tone="good" />
              <Stat label={t("paidTotal")} value={p.paid} money tone="bad" />
              <Stat label={t("transfersIn")} value={p.transfersIn} money />
              <Stat label={t("transfersOut")} value={p.transfersOut} money />
              <Stat label={t("netPosition")} value={p.net} money sub={t("netHelp")} />
              <Stat label={t("cashInHand")} value={expectedCash(o.id, today())} money sub={t("cashInHandHelp")} />
            </div>
          </Section>
        ))}
        {!positions.length && <Empty />}
      </div>

      {settle && (
        <section className="register-paper rounded-xl border-2 border-primary/30 p-5">
          <h2 className="text-xl font-bold text-primary">{t("betweenBrothers")}</h2>
          {settle.from == null ? <p className="mt-2 text-2xl font-bold">{t("settled")}</p> : (
            <p className="mt-2 text-2xl font-bold">
              {positions[settle.from === "A" ? 0 : 1]!.o.display_name} → {positions[settle.from === "A" ? 1 : 0]!.o.display_name}: <span className="num">Rs {fmt(settle.amount)}</span>
            </p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">{t("betweenBrothersHelp")}</p>
        </section>
      )}

      <Section title={t("cashCount")}>
        <div className="no-print mb-4 grid gap-3 md:grid-cols-5">
          <Field label={t("owner")}><OwnerSelect value={cc.owner} onChange={(v) => setCc((c) => ({ ...c, owner: v }))} /></Field>
          <Field label={t("date")}><DateInput value={cc.date} onChange={(v) => setCc({ ...cc, date: v })} /></Field>
          <Field label={t("countedCash")}><NumInput value={cc.counted} onChange={(v) => setCc({ ...cc, counted: v })} /></Field>
          <Field label={t("note")}><Input className="h-12" value={cc.note} onChange={(e) => setCc({ ...cc, note: e.target.value })} /></Field>
          <div className="flex items-end"><ConfirmButton size="lg" onConfirm={saveCount} disabled={!cc.counted} description={t("cashCountHelp")}>{t("save")}</ConfirmButton></div>
        </div>
        {!(countsQ.data ?? []).length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead><tr className="text-muted-foreground">
                <th className="p-2 text-start">{t("date")}</th><th className="p-2 text-start">{t("owner")}</th><th className="p-2">{t("expectedCash")}</th>
                <th className="p-2">{t("countedCash")}</th><th className="p-2">{t("diff")}</th><th className="p-2 text-start">{t("note")}</th><th />
              </tr></thead>
              <tbody>
                {(countsQ.data ?? []).map((c) => {
                  const exp = expectedCash(c.owner_user_id, c.entry_date);
                  const diff = Number(c.counted) - exp;
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="num p-2">{fmtDate(c.entry_date)}</td><td className="p-2">{ownerName(c.owner_user_id)}</td>
                      <td className="num p-2 text-center">{fmt(exp)}</td><td className="num p-2 text-center">{fmt(Number(c.counted))}</td>
                      <td className={`num p-2 text-center font-bold ${diff === 0 ? "text-success" : "text-destructive"}`}>{diff > 0 ? "+" : ""}{fmt(diff)}</td>
                      <td className="p-2 text-sm text-muted-foreground">{c.note}</td>
                      <td className="no-print p-1"><ConfirmButton size="sm" variant="outline" onConfirm={() => voidCount(c.id)}>{t("remove")}</ConfirmButton></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={t("ownerEntries")} actions={
        <Select className="w-48" value={selected} onChange={(e) => setSel(e.target.value)}>
          {list.map((o) => <option key={o.id} value={o.id}>{o.display_name}</option>)}
        </Select>}>
        {!ownerTx.length ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead><tr className="text-muted-foreground">
                <th className="p-2 text-start">{t("date")}</th><th className="p-2 text-start">{t("type")}</th><th className="p-2 text-start">{t("detail")}</th>
                <th className="p-2">{t("in")}</th><th className="p-2">{t("out")}</th>
              </tr></thead>
              <tbody>
                {ownerTx.slice(0, 300).map((x) => {
                  const incoming = x.kind === "owner_transfer" ? x.to_user_id === selected : x.direction === "in";
                  const name = partyName(x.party_id);
                  return (
                    <tr key={x.id} className={`border-t ${x.kind === "adjustment" ? "text-muted-foreground line-through" : ""}`}>
                      <td className="num p-2">{fmtDate(x.entry_date)}</td>
                      <td className="p-2">{t(txnKindLabel(x))} <span className="text-xs text-muted-foreground">({methodLabel(t, x.method)})</span></td>
                      <td className="p-2">
                        {name && x.party_id ? <Link to="/party/$id" params={{ id: x.party_id }} className="text-primary underline">{name}</Link> : null}
                        {x.kind === "owner_transfer" && <span>{ownerName(x.handler_user_id)} → {ownerName(x.to_user_id)}</span>}
                        {x.note && <span className="text-sm text-muted-foreground"> — {x.note}</span>}
                      </td>
                      <td className="num p-2 text-center text-success">{incoming ? fmt(Number(x.amount)) : ""}</td>
                      <td className="num p-2 text-center text-destructive">{!incoming ? fmt(Number(x.amount)) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
