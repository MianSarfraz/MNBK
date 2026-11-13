"use client";

import { useEffect, useState, type ReactNode, type SelectHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fmt, fmtDate, useT, type Key } from "@/lib/i18n";
import { addDays, normalizeDigits, weekStart } from "@/lib/kiln-math";
import { seasonForDate, today, useOwners, useSeasons } from "@/lib/data";

export function Field({ label, children, className, hint }: { label: ReactNode; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-sm text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cn("h-10 w-full rounded-md border bg-background px-2 text-base disabled:opacity-50", className)} />;
}

/** Big whole-number input. Accepts Urdu digits from phone keyboards. */
export function NumInput({ value, onChange, allowNegative, className, ...p }: {
  value: string; onChange: (v: string) => void; allowNegative?: boolean; className?: string;
  placeholder?: string; disabled?: boolean; required?: boolean; autoFocus?: boolean; id?: string;
}) {
  return (
    <Input {...p} className={cn("num h-10 text-lg", className)} inputMode="numeric" value={value}
      onChange={(e) => onChange(normalizeDigits(e.target.value, allowNegative))} />
  );
}

export function DateInput({ value, onChange, className, min, max }: { value: string; onChange: (v: string) => void; className?: string; min?: string | undefined; max?: string | undefined }) {
  return <Input className={cn("h-10", className)} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} required />;
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
        <h1 className="text-xl font-bold md:text-2xl">{title}</h1>
        {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, tone, money, sub }: { label: ReactNode; value: number | null | undefined; tone?: "good" | "bad" | "warn" | undefined; money?: boolean; sub?: ReactNode | undefined }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("num mt-0.5 text-lg font-semibold md:text-xl text-primary", tone === "good" && "text-success", tone === "bad" && "text-destructive", tone === "warn" && "text-warning-foreground")}>
        {money ? "Rs " : ""}{fmt(value ?? 0)}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Section({ title, children, className, actions }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-xl border bg-card p-3 md:p-4", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold md:text-lg">{title}</h2>}
          {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useT();
  return <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">{children ?? t("nothingYet")}</div>;
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

const WEEK_KEY = "mnb-week";
/** Week (Thu–Wed) navigation by date — weeks and seasons are created automatically, nothing to set up. */
export function useWeekNav() {
  const seasons = useSeasons();
  const [start, setStart] = useState(() => {
    try { const v = sessionStorage.getItem(WEEK_KEY); if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return weekStart(v); } catch { /* ignore */ }
    return weekStart(today());
  });
  const go = (date: string) => {
    const ws = weekStart(date);
    try { sessionStorage.setItem(WEEK_KEY, ws); } catch { /* ignore */ }
    setStart(ws);
  };
  const end = addDays(start, 6);
  const season = seasonForDate(seasons.data ?? [], start);
  const firstThu = season ? weekStart(season.start_date) : undefined;
  const weekNo = firstThu ? Math.round((Date.parse(start) - Date.parse(firstThu)) / (7 * 86400000)) + 1 : undefined;
  return {
    start, end, season, weekNo, go,
    prev: () => go(addDays(start, -7)), next: () => go(addDays(start, 7)),
    isThisWeek: start === weekStart(today()),
    readOnly: !!season?.is_closed,
  };
}
export type WeekNav = ReturnType<typeof useWeekNav>;

export function WeekPicker({ nav }: { nav: WeekNav }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border bg-card">
        <button type="button" className="h-10 px-3 text-lg" onClick={nav.prev} aria-label={t("prevWeek")}>‹</button>
        <div className="min-w-40 px-1 text-center leading-tight">
          <div className="num text-sm font-semibold">{fmtDate(nav.start).slice(0, 5)} → {fmtDate(nav.end)}</div>
          <div className="text-[11px] text-muted-foreground">{nav.season ? `${nav.season.name} · ${t("week")} ${nav.weekNo}` : t("week")}</div>
        </div>
        <button type="button" className="h-10 px-3 text-lg" onClick={nav.next} aria-label={t("nextWeek")}>›</button>
      </div>
      {!nav.isThisWeek && <button type="button" className="h-10 rounded-lg border bg-card px-3 text-sm" onClick={() => nav.go(today())}>{t("thisWeek")}</button>}
      <label className="flex h-10 items-center gap-1 rounded-lg border bg-card px-2 text-sm text-muted-foreground">
        {t("goToDate")}
        <input type="date" className="bg-transparent text-foreground" value="" onChange={(e) => e.target.value && nav.go(e.target.value)} />
      </label>
      {nav.readOnly && <span className="rounded bg-destructive px-2 text-sm text-destructive-foreground">{t("closed")}</span>}
    </div>
  );
}

/** Clamp a date into [min, max]. */
export function clampDate(d: string, min: string, max: string) {
  return d < min ? min : d > max ? max : d;
}
