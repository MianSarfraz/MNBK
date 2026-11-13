"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useT } from "@/lib/i18n";
import { useOwners } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Empty, Field, PageHeader, Select } from "@/components/kit";

const TABLES = ["transactions", "production_entries", "kiln_entries", "sales", "sale_items", "salary_months", "parties", "party_rates", "stock_adjustments", "cash_counts", "seasons", "qualities", "expense_categories"];
const IGNORE = new Set(["updated_at", "updated_by", "created_at"]);

function diff(oldV: Json | null, newV: Json | null) {
  const o = (oldV ?? {}) as Record<string, Json>;
  const n = (newV ?? {}) as Record<string, Json>;
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  const out: { k: string; a: string; b: string }[] = [];
  for (const k of keys) {
    if (IGNORE.has(k)) continue;
    const a = JSON.stringify(o[k] ?? null), b = JSON.stringify(n[k] ?? null);
    if (a !== b) out.push({ k, a: oldV ? a : "", b: newV ? b : "" });
  }
  return out;
}

export default function HistoryPage() {
  const { t } = useT();
  const owners = useOwners();
  const [table, setTable] = useState("");
  const [limit, setLimit] = useState(100);
  const q = useQuery({
    queryKey: ["audit", table, limit],
    queryFn: async () => {
      let query = supabase.from("audit_log").select("*").order("id", { ascending: false }).limit(limit);
      if (table) query = query.eq("table_name", table);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  const who = (id: string | null) => (owners.data ?? []).find((o) => o.id === id)?.display_name ?? "—";
  const actionLabel = (a: string, n: Json | null, o: Json | null) => {
    const del = (n as Record<string, Json> | null)?.["deleted_at"] && !(o as Record<string, Json> | null)?.["deleted_at"];
    return del ? t("voided") : a === "INSERT" ? t("added") : a === "UPDATE" ? t("edited") : a;
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("history")} sub={t("historyHelp")}
        actions={<Field label={t("type")} className="w-56"><Select value={table} onChange={(e) => setTable(e.target.value)}>
          <option value="">{t("all")}</option>{TABLES.map((x) => <option key={x} value={x}>{x}</option>)}
        </Select></Field>} />
      {!(q.data ?? []).length ? <Empty /> : (
        <div className="space-y-2">
          {(q.data ?? []).map((r) => {
            const d = diff(r.old_values, r.new_values);
            return (
              <div key={r.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded bg-secondary px-2 font-semibold">{actionLabel(r.action, r.new_values, r.old_values)}</span>
                  <span className="font-mono">{r.table_name}</span>
                  <span className="text-muted-foreground">{who(r.changed_by)}</span>
                  <span className="num text-muted-foreground">{new Date(r.changed_at).toLocaleString("en-GB")}</span>
                </div>
                {r.action !== "INSERT" && d.length > 0 && (
                  <table className="mt-2 w-full text-sm" dir="ltr"><tbody>
                    {d.map((x) => (
                      <tr key={x.k} className="border-t"><td className="p-1 font-mono text-muted-foreground">{x.k}</td>
                        <td className="p-1 font-mono text-destructive line-through">{x.a}</td><td className="p-1 font-mono text-success">{x.b}</td></tr>
                    ))}
                  </tbody></table>
                )}
              </div>
            );
          })}
          {(q.data ?? []).length >= limit && <Button variant="outline" onClick={() => setLimit(limit + 200)}>{t("loadMore")}</Button>}
        </div>
      )}
    </div>
  );
}
