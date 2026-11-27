"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmt, useT, type Key } from "@/lib/i18n";
import { parseWhole, type RawType } from "@/lib/kiln-math";
import { fetchAll, myId, useKachaStock } from "@/lib/data";
import { PATHEER } from "@/lib/features";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Cell, LetterRow, Sheet } from "@/components/sheet";

type Row = Tables<"raw_store">;
export const RAW_TYPES: { v: RawType; k: Key }[] = [{ v: "brick", k: "rawBrick" }, { v: "9t", k: "raw9t" }];
const SOURCES: { v: string; k: Key }[] = [{ v: "outsource", k: "srcOutsource" }, { v: "opening", k: "srcOpening" }, { v: "adjust", k: "srcAdjust" }];

/** Kacha store balances (bricks / 9t tiles) — small cards, shown on Rehra and Stock. */
export function KachaStoreCards() {
  const { t } = useT();
  const stock = useKachaStock();
  return (
    <div className="grid grid-cols-2 gap-2">
      {RAW_TYPES.map(({ v, k }) => {
        const r = (stock.data ?? []).find((x) => x.raw_type === v);
        const bal = Number(r?.balance ?? 0);
        const stacked = Number(r?.from_patheer ?? 0) + Number(r?.outsourced ?? 0) + Number(r?.opening ?? 0) + Number(r?.adjusted ?? 0);
        return (
          <div key={v} className={`rounded-xl border bg-card p-3 ${bal < 0 ? "border-destructive" : ""}`}>
            <div className="text-xs text-muted-foreground">{t("inStore")} — {t(k)}</div>
            <div className={`num text-2xl font-bold ${bal < 0 ? "text-destructive" : ""}`}>{fmt(bal)}</div>
            <div className="num text-[11px] text-muted-foreground">{fmt(stacked)} {t("stackedIn")} − {fmt(Number(r?.used ?? 0))} {t("usedOut")}</div>
          </div>
        );
      })}
    </div>
  );
}

/** The kacha store sheet for one week: what was stacked, from whom. Rehra loads from the store are in the loads sheet. */
export function KachaStore({ start, end, readOnly, patheers, defaultDate }: {
  start: string; end: string; readOnly: boolean; patheers: Tables<"parties">[]; defaultDate: string;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const rowsQ = useQuery({
    queryKey: ["raw-store", start],
    queryFn: () => fetchAll<Row>((a, b) => supabase.from("raw_store").select("*").is("deleted_at", null).gte("entry_date", start).lte("entry_date", end).order("entry_date").order("created_at").range(a, b)),
  });
  const suppliersQ = useQuery({
    queryKey: ["raw-store-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_store").select("supplier").eq("source", "outsource").is("deleted_at", null).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.supplier).filter((x): x is string => !!x))];
    },
  });
  const rows = rowsQ.data ?? [];
  const pName = (id: string | null) => patheers.find((p) => p.id === id)?.name ?? "—";
  const srcLabel = (r: Row) => (r.source === "patheer" ? t("srcPatheer") : t(SOURCES.find((s) => s.v === r.source)?.k ?? "srcAdjust"));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["raw-store"] });
    qc.invalidateQueries({ queryKey: ["raw-store-stock"] });
    qc.invalidateQueries({ queryKey: ["raw-store-suppliers"] });
    qc.invalidateQueries({ queryKey: ["raw-reconciliation"] });
  };
  async function update(id: string, patch: Partial<Row>) {
    const { error } = await supabase.from("raw_store").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
  }
  const total = (v: RawType) => rows.filter((r) => r.raw_type === v).reduce((s, r) => s + Number(r.count), 0);

  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-semibold">{t("kachaStore")}</div>
        <p className="text-xs text-muted-foreground">{t("kachaStoreHelp")}</p>
      </div>
      <KachaStoreCards />
      <datalist id="kacha-suppliers">{(suppliersQ.data ?? []).map((s) => <option key={s} value={s} />)}</datalist>
      <Sheet minWidth={820}>
        <thead>
          <LetterRow cols={7} />
          <tr>
            <th className="rn">#</th><th className="w-36">{t("date")}</th><th className="w-28">{t("rawType")}</th><th className="w-40">{t("sourceCol")}</th>
            <th>{t("supplierCol")}</th><th className="n w-28">{t("bricksCol")}</th><th>{t("note")}</th><th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="rn">{i + 1}</td>
              <td className="c"><Cell type="date" value={r.entry_date} disabled={readOnly} onCommit={(v) => v && update(r.id, { entry_date: v })} /></td>
              <td className="c"><select className="cell" value={r.raw_type} disabled={readOnly} onChange={(e) => update(r.id, { raw_type: e.target.value })} aria-label={t("rawType")}>
                {RAW_TYPES.map(({ v, k }) => <option key={v} value={v}>{t(k)}</option>)}
              </select></td>
              <td className="whitespace-nowrap px-2">{srcLabel(r)}</td>
              <td className="c">{r.source === "outsource"
                ? <Cell value={r.supplier ?? ""} list="kacha-suppliers" disabled={readOnly} onCommit={(v) => v.trim() && update(r.id, { supplier: v.trim() })} />
                : <span className="px-2">{r.source === "patheer" ? pName(r.patheer_id) : "—"}</span>}</td>
              <td className="c"><Cell numeric value={String(Number(r.count))} disabled={readOnly} bad={Number(r.count) < 0}
                onCommit={(v) => { const n = parseSigned(v); if (n && (n > 0 || r.source === "adjust")) update(r.id, { count: n }); }} /></td>
              <td className="c"><Cell value={r.notes ?? ""} placeholder="—" disabled={readOnly} onCommit={(v) => update(r.id, { notes: v.trim() || null })} /></td>
              <td className="px-1">{!readOnly && <ConfirmButton size="sm" variant="outline" onConfirm={() => update(r.id, { deleted_at: new Date().toISOString() })}>×</ConfirmButton>}</td>
            </tr>
          ))}
          {!readOnly && <NewStoreRow n={rows.length + 1} patheers={PATHEER ? patheers.filter((p) => p.is_active) : []} defaultDate={rows.at(-1)?.entry_date ?? defaultDate} onSaved={refresh} />}
          <tr className="total">
            <td className="rn" /><td colSpan={4}>{t("total")}</td>
            <td className="n num">{fmt(total("brick"))}{total("9t") ? <div className="text-[11px] font-normal">+ {fmt(total("9t"))} {t("raw9t")}</div> : null}</td><td colSpan={2} />
          </tr>
        </tbody>
      </Sheet>
      {!rowsQ.isLoading && !rows.length && <p className="text-xs text-muted-foreground">{t("storeEmpty")}</p>}
    </div>
  );
}

/** Whole number, allowing a leading minus (only corrections may be negative). */
function parseSigned(v: string): number | null {
  const s = v.trim();
  const neg = s.startsWith("-") || s.startsWith("−");
  const n = parseWhole(neg ? s.slice(1) : s);
  return n == null ? null : neg ? -n : n;
}

function NewStoreRow({ n, patheers, defaultDate, onSaved }: { n: number; patheers: Tables<"parties">[]; defaultDate: string; onSaved: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({ date: "", type: "brick" as RawType, source: "outsource", supplier: "", count: "", note: "" });
  const [busy, setBusy] = useState(false);
  const date = f.date || defaultDate;
  const isPatheer = f.source.startsWith("p:");
  async function save() {
    const count = parseSigned(f.count);
    if (!count || (count < 0 && f.source !== "adjust")) return void toast.error(t("wholeNumbers"));
    if (f.source === "outsource" && !f.supplier.trim()) return void toast.error(t("supplierName"));
    setBusy(true);
    const { error } = await supabase.from("raw_store").insert({
      entry_date: date, raw_type: f.type, source: isPatheer ? "patheer" : f.source, patheer_id: isPatheer ? f.source.slice(2) : null,
      supplier: f.source === "outsource" ? f.supplier.trim() : null, count, notes: f.note.trim() || null, created_by: await myId(),
    });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(`${t("saved")} — ${fmt(count)} ${t(f.type === "9t" ? "raw9t" : "rawBrick").toLowerCase()}`);
    setF({ ...f, date, count: "", note: "" });
    onSaved();
  }
  const enter = (e: React.KeyboardEvent) => { if (e.key === "Enter" && f.count) { e.preventDefault(); save(); } };
  return (
    <tr className="new">
      <td className="rn">{n}</td>
      <td className="c"><input className="cell" type="date" value={date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label={t("date")} /></td>
      <td className="c"><select className="cell" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as RawType })} aria-label={t("rawType")}>
        {RAW_TYPES.map(({ v, k }) => <option key={v} value={v}>{t(k)}</option>)}
      </select></td>
      <td className="c"><select className="cell" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} aria-label={t("sourceCol")}>
        {SOURCES.map(({ v, k }) => <option key={v} value={v}>{t(k)}</option>)}
        {patheers.length > 0 && <optgroup label={t("srcPatheer")}>{patheers.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name}</option>)}</optgroup>}
      </select></td>
      <td className="c">{f.source === "outsource"
        ? <input className="cell" list="kacha-suppliers" placeholder={t("supplierName")} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} onKeyDown={enter} aria-label={t("supplierName")} />
        : <span className="px-2 text-muted-foreground">{isPatheer ? patheers.find((p) => `p:${p.id}` === f.source)?.name : "—"}</span>}</td>
      <td className="c"><input className="cell n num" inputMode="numeric" placeholder={f.source === "adjust" ? "+/−" : "0"} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} onKeyDown={enter} aria-label={t("bricksCol")} /></td>
      <td className="c"><input className="cell" placeholder={t("note")} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} onKeyDown={enter} /></td>
      <td className="px-1"><Button size="sm" className="h-7" disabled={busy || !f.count} onClick={save}>{t("add")}</Button></td>
    </tr>
  );
}
