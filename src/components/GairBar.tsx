"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fmtDate, useT } from "@/lib/i18n";
import { daysBetween } from "@/lib/kiln-math";
import { gairName, myId, today, useGairList } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Gair = Tables<"gairs">;

/** Open gair(s) with a Close button, and "Start Gair N" — shown on Rehra, Nakasi, Production and Gair check. */
export function GairBar({ showCheckLink = true }: { showCheckLink?: boolean }) {
  const { t } = useT();
  const qc = useQueryClient();
  const list = useGairList();
  const gairs = list.data ?? [];
  const open = gairs.filter((g) => !g.closed_on).sort((a, b) => a.number - b.number);
  const next = gairs.reduce((m, g) => Math.max(m, g.number), 0) + 1;
  const [dlg, setDlg] = useState<null | { mode: "start" } | { mode: "close"; gair: Gair }>(null);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const refresh = () => ["gairs", "gair-check", "kiln", "kiln-weekly", "production"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  async function moveStart(g: Gair, d: string) {
    if (!window.confirm(`${gairName(g)}: ${t("startedOn")} ${fmtDate(g.started_on)} → ${fmtDate(d)}?\n${t("editStartHelp")}`)) return;
    const { error } = await supabase.from("gairs").update({ started_on: d }).eq("id", g.id);
    if (error) return void toast.error(error.message);
    toast.success(`${gairName(g)} — ${t("startedOn")} ${fmtDate(d)}`);
    refresh();
  }
  async function confirm() {
    if (!dlg) return;
    setBusy(true);
    const { error } = dlg.mode === "start"
      ? await supabase.from("gairs").insert({ number: next, started_on: date, created_by: await myId() })
      : await supabase.from("gairs").update({ closed_on: date }).eq("id", dlg.gair.id);
    setBusy(false);
    if (error) return void toast.error(/check/i.test(error.message) ? t("closeBeforeStart") : error.message);
    toast.success(dlg.mode === "start" ? `${t("gairStarted")}: Gair ${next}` : `${t("gairClosed")}: ${gairName(dlg.gair)}`);
    setDlg(null);
    refresh();
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 text-sm">
      {open.length === 0 && <span className="px-1 text-muted-foreground">{t("noOpenGair")}</span>}
      {open.map((g) => (
        <span key={g.id} className="inline-flex items-center gap-2 rounded-lg border border-warning bg-warning/10 px-2 py-1">
          <span className="font-semibold">🔥 {gairName(g)}</span>
          <label className="num flex items-center gap-1 text-xs text-muted-foreground" title={t("editStartHelp")}>{t("since")}
            <input type="date" className="h-7 rounded border bg-background px-1 text-foreground" value={g.started_on} max={today()} aria-label={`${t("startedOn")} ${gairName(g)}`}
              onChange={(e) => e.target.value && e.target.value !== g.started_on && moveStart(g, e.target.value)} />
            · {daysBetween(g.started_on, today()) + 1} {t("days")}</label>
          <Button size="sm" variant="outline" className="h-7" onClick={() => { setDate(today()); setDlg({ mode: "close", gair: g }); }}>{t("closeGair")}</Button>
        </span>
      ))}
      <Button size="sm" className="h-8" onClick={() => { setDate(today()); setDlg({ mode: "start" }); }}>+ {t("startGair")} {next}</Button>
      {showCheckLink && <Link href="/gair" className="ms-auto text-xs text-primary underline">{t("gairCheck")}</Link>}

      {dlg && (
        <Dialog open onOpenChange={(o) => !o && setDlg(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{dlg.mode === "start" ? `${t("startGair")} ${next}` : `${t("closeGair")}: ${gairName(dlg.gair)}`}</DialogTitle>
              <DialogDescription>{dlg.mode === "start" ? t("startGairHelp") : t("closeGairHelp")}</DialogDescription>
            </DialogHeader>
            <label className="grid gap-1 text-sm">{dlg.mode === "start" ? t("startedOn") : t("closedOn")}
              <input type="date" className="h-10 rounded-md border bg-background px-2" value={date} onChange={(e) => setDate(e.target.value)} aria-label={dlg.mode === "start" ? t("startedOn") : t("closedOn")} />
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDlg(null)}>{t("cancel")}</Button>
              <Button disabled={busy || !date} onClick={confirm}>{dlg.mode === "start" ? t("startGair") : t("closeGair")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Gair cell: open gairs first (🔥), then closed ones. "auto" (new rows only) = the open gair the database picks. */
export function GairSelect({ value, onChange, gairs, disabled, auto, bad }: {
  value: string; onChange: (v: string) => void; gairs: Gair[]; disabled?: boolean; auto?: string; bad?: boolean;
}) {
  const { t } = useT();
  const open = gairs.filter((g) => !g.closed_on).sort((a, b) => b.number - a.number);
  const closed = gairs.filter((g) => g.closed_on).sort((a, b) => b.number - a.number);
  return (
    <select className={`cell ${bad ? "bad" : ""}`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={t("firingRef")}>
      <option value="">{auto ?? "—"}</option>
      {open.map((g) => <option key={g.id} value={g.id}>🔥 {gairName(g)}</option>)}
      {closed.length > 0 && <optgroup label={t("closedGairs")}>{closed.map((g) => <option key={g.id} value={g.id}>{gairName(g)}</option>)}</optgroup>}
    </select>
  );
}
