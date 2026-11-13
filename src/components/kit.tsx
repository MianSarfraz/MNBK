"use client";

import { useEffect, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fmt, fmtDate, useT, type Key } from "@/lib/i18n";
import { normalizeDigits } from "@/lib/kiln-math";
import { seasonForDate, today, useOwners, useSeasons, useWeeks } from "@/lib/data";

export function Field({ label, children, className, hint }: { label: ReactNode; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-base">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cn("h-12 w-full rounded-md border bg-background px-2 text-lg disabled:opacity-50", className)} />;
}

/** Big whole-number input. Accepts Urdu digits from phone keyboards. */
export function NumInput({ value, onChange, allowNegative, className, ...p }: {
  value: string; onChange: (v: string) => void; allowNegative?: boolean; className?: string;
  placeholder?: string; disabled?: boolean; required?: boolean; autoFocus?: boolean; id?: string;
}) {
  return (
    <Input {...p} className={cn("num h-12 text-xl", className)} inputMode="numeric" value={value}
      onChange={(e) => onChange(normalizeDigits(e.target.value, allowNegative))} />
  );
}

export function DateInput({ value, onChange, className, min, max }: { value: string; onChange: (v: string) => void; className?: string; min?: string | undefined; max?: string | undefined }) {
  return <Input className={cn("h-12", className)} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} required />;
}

export function OwnerSelect({ value, onChange, className, placeholder }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string }) {
  const owners = useOwners();
  // Default to the only owner when there is just one.
  useEffect(() => {
    if (!value && owners.data?.length === 1) onChange(owners.data[0]!.id);
  }, [owners.data, value, onChange]);
  return (
    <Select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? "—"}</option>
      {(owners.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.display_name}</option>)}
    </Select>
  );
}

export const METHODS = ["cash", "bank", "easypaisa", "jazzcash", "other"] as const;
export type Method = (typeof METHODS)[number];
const methodKeys: Record<Method, Key> = { cash: "mCash", bank: "mBank", easypaisa: "mEasypaisa", jazzcash: "mJazzcash", other: "mOther" };
export function methodLabel(t: (k: Key) => string, m: string) {
  return t(methodKeys[m as Method] ?? "mOther");
}
export function MethodSelect({ value, onChange, className }: { value: string; onChange: (v: Method) => void; className?: string }) {
  const { t } = useT();
  return (
    <Select className={className} value={value} onChange={(e) => onChange(e.target.value as Method)}>
      {METHODS.map((m) => <option key={m} value={m}>{t(methodKeys[m])}</option>)}
    </Select>
  );
}

export function PageHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {sub && <div className="text-muted-foreground">{sub}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, tone, money, sub }: { label: ReactNode; value: number | null | undefined; tone?: "good" | "bad" | "warn" | undefined; money?: boolean; sub?: ReactNode | undefined }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("num mt-1 text-2xl font-semibold text-primary", tone === "good" && "text-success", tone === "bad" && "text-destructive", tone === "warn" && "text-warning-foreground")}>
        {money ? "Rs " : ""}{fmt(value ?? 0)}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Section({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 md:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-xl font-bold">{title}</h2>}
          {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useT();
  return <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{children ?? t("nothingYet")}</div>;
}

/** Shown only when printing: business name and statement title. */
export function PrintHeader({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  const { t } = useT();
  return (
    <div className="print-only mb-4 border-b-2 border-primary pb-2 text-center">
      <div className="text-2xl font-bold">{t("appName")}</div>
      <div className="text-lg">{title}</div>
      {sub && <div className="text-sm">{sub}</div>}
      <div className="num text-xs">{fmtDate(today())}</div>
    </div>
  );
}

/** Season + week selection shared by the weekly registers. Defaults to the open season and this week. */
export function useSeasonWeek() {
  const seasons = useSeasons();
  const [seasonId, setSeasonId] = useState<string>();
  useEffect(() => {
    if (seasonId || !seasons.data?.length) return;
    const open = seasons.data.filter((s) => !s.is_closed);
    setSeasonId((seasonForDate(open, today()) ?? open[0] ?? seasons.data[0]!).id);
  }, [seasons.data, seasonId]);
  const weeks = useWeeks(seasonId);
  const [weekId, setWeekId] = useState<string>();
  useEffect(() => {
    if (!weeks.data?.length) return;
    if (weekId && weeks.data.some((w) => w.id === weekId)) return;
    const d = today();
    setWeekId((weeks.data.find((w) => w.start_date <= d && w.end_date >= d) ?? weeks.data[weeks.data.length - 1]!).id);
  }, [weeks.data, weekId]);
  const season = (seasons.data ?? []).find((s) => s.id === seasonId);
  const week = (weeks.data ?? []).find((w) => w.id === weekId);
  return {
    seasons, season, seasonId, weeks, week, weekId, setWeekId,
    setSeasonId: (id: string) => { setSeasonId(id); setWeekId(undefined); },
    readOnly: !!season?.is_closed,
  };
}

export function SeasonWeekPicker({ sw }: { sw: ReturnType<typeof useSeasonWeek> }) {
  const { t } = useT();
  const idx = (sw.weeks.data ?? []).findIndex((w) => w.id === sw.weekId);
  const step = (d: number) => {
    const w = (sw.weeks.data ?? [])[idx + d];
    if (w) sw.setWeekId(w.id);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select className="w-auto bg-card" value={sw.seasonId ?? ""} onChange={(e) => sw.setSeasonId(e.target.value)}>
        {(sw.seasons.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_closed ? ` (${t("closed")})` : ""}</option>)}
      </Select>
      <button type="button" className="h-12 rounded-md border bg-card px-3 text-xl disabled:opacity-40" disabled={idx <= 0} onClick={() => step(-1)} aria-label="previous week"><span className="inline-block rtl:rotate-180">‹</span></button>
      <Select className="num w-auto bg-card" value={sw.weekId ?? ""} onChange={(e) => sw.setWeekId(e.target.value)}>
        {(sw.weeks.data ?? []).map((w) => <option key={w.id} value={w.id}>#{w.week_number} {fmtDate(w.start_date)} → {fmtDate(w.end_date)}</option>)}
      </Select>
      <button type="button" className="h-12 rounded-md border bg-card px-3 text-xl disabled:opacity-40" disabled={idx < 0 || idx >= (sw.weeks.data?.length ?? 0) - 1} onClick={() => step(1)} aria-label="next week"><span className="inline-block rtl:rotate-180">›</span></button>
      {sw.readOnly && <span className="rounded bg-destructive px-2 text-destructive-foreground">{t("closed")}</span>}
    </div>
  );
}

/** Clamp a date into [min, max]. */
export function clampDate(d: string, min: string, max: string) {
  return d < min ? min : d > max ? max : d;
}
