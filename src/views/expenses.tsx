"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { fmt, fmtDate, useT, type Key } from "@/lib/i18n";
import { isCashMovement, monthEnd, monthStart, parseWhole, type TxnKind } from "@/lib/kiln-math";
import { errMsg, fetchAll, myId, openReceipt, today, uploadReceipt, useExpenseCategories, useOwners, useParties } from "@/lib/data";
import { downloadExcel } from "@/lib/export";
import { txnKindLabel } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DateInput, Empty, Field, methodLabel, MethodSelect, NumInput, OwnerSelect, PageHeader, PrintHeader, Section, Select, Stat, type Method } from "@/components/kit";

type Txn = Tables<"transactions">;

const FILTERS: { key: string; label: Key; match: (x: Txn) => boolean }[] = [
  { key: "all", label: "all", match: () => true },
  { key: "expense", label: "expense", match: (x) => x.kind === "expense" || (x.kind === "other" && x.direction === "out") },
  { key: "kharcha", label: "kharcha", match: (x) => x.kind === "kharcha" },
  { key: "salary", label: "salaryPaid", match: (x) => x.kind === "salary" },
  { key: "workers", label: "workerPayments", match: (x) => x.kind === "worker_payment_us" || x.kind === "worker_payment_them" },
  { key: "sales", label: "paymentReceived", match: (x) => x.kind === "sale_receipt" },
  { key: "transfer", label: "ownerTransfer", match: (x) => x.kind === "owner_transfer" },
  { key: "income", label: "otherIncome", match: (x) => x.kind === "other" && x.direction === "in" },
  { key: "adjustment", label: "adjustment", match: (x) => x.kind === "adjustment" },
];

export default function ExpensesPage() {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const owners = useOwners();
  const cats = useExpenseCategories();
  const parties = useParties();
  const [range, setRange] = useState({ from: monthStart(today()), to: monthEnd(today()) });
  const [filter, setFilter] = useState({ kind: "all", owner: "", category: "", search: "" });
  const txQ = useQuery({
    queryKey: ["transactions", range.from, range.to],
    queryFn: () => fetchAll<Txn>((a, b) => supabase.from("transactions").select("*").is("deleted_at", null)
      .gte("entry_date", range.from).lte("entry_date", range.to).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).range(a, b)),
  });

  const ownerName = (id: string | null | undefined) => (owners.data ?? []).find((o) => o.id === id)?.display_name ?? "—";
  const party = (id: string | null) => (parties.data ?? []).find((p) => p.id === id);
  const catName = (id: string | null) => { const c = (cats.data ?? []).find((c) => c.id === id); return c ? (lang === "ur" ? c.name_ur : c.name_en) : ""; };

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter.kind) ?? FILTERS[0]!;
    const s = filter.search.trim().toLowerCase();
    return (txQ.data ?? []).filter((x) =>
      f.match(x) &&
      (!filter.owner || x.handler_user_id === filter.owner || x.to_user_id === filter.owner) &&
      (!filter.category || x.expense_category_id === filter.category) &&
      (!s || (x.note ?? "").toLowerCase().includes(s) || (party(x.party_id)?.name ?? "").toLowerCase().includes(s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txQ.data, filter, parties.data]);
  const cash = rows.filter((x) => isCashMovement(x.kind as TxnKind) && x.kind !== "owner_transfer");
  const totalIn = cash.filter((x) => x.direction === "in").reduce((s, x) => s + Number(x.amount), 0);
  const totalOut = cash.filter((x) => x.direction === "out").reduce((s, x) => s + Number(x.amount), 0);

  async function voidTx(id: string) {
    const { error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else toast.success(t("voided"));
    qc.invalidateQueries();
  }

  function exportXls() {
    downloadExcel(`khatta-${range.from}-${range.to}`, [{
      name: "Transactions",
      rows: [
        ["Date", "Type", "Party", "Category", "Note", "Paid/received by", "To owner", "Method", "In", "Out"],
        ...rows.map((x) => [x.entry_date, t(txnKindLabel(x)), party(x.party_id)?.name ?? "", catName(x.expense_category_id), x.note ?? "",
          ownerName(x.handler_user_id), x.to_user_id ? ownerName(x.to_user_id) : "", x.method,
          x.direction === "in" ? Number(x.amount) : null, x.direction === "out" ? Number(x.amount) : null]),
        [], ["", "", "", "", "", "", "", "Total (cash moves)", totalIn, totalOut],
      ],
    }]);
  }

  return (
    <div className="space-y-5">
      <PrintHeader title={t("expenseKhatta")} sub={`${fmtDate(range.from)} → ${fmtDate(range.to)}`} />
      <PageHeader title={t("expenseKhatta")} sub={t("expenseKhattaHelp")}
        actions={<>
          <Link href="/people/vendor" className="inline-flex h-10 items-center rounded-md border bg-card px-4">{t("vendors")}</Link>
          <Button variant="outline" onClick={exportXls}>Excel</Button>
          <Button variant="outline" onClick={() => window.print()}>{t("print")} / PDF</Button>
        </>} />

      <EntryForm />

      <div className="no-print flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <Field label={t("from")}><DateInput value={range.from} onChange={(v) => setRange({ ...range, from: v })} /></Field>
        <Field label={t("to")}><DateInput value={range.to} onChange={(v) => setRange({ ...range, to: v })} /></Field>
        <Field label={t("type")} className="w-44"><Select value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })}>
          {FILTERS.map((f) => <option key={f.key} value={f.key}>{t(f.label)}</option>)}
        </Select></Field>
        <Field label={t("owner")} className="w-44"><OwnerSelect value={filter.owner} onChange={(v) => setFilter((f) => ({ ...f, owner: v }))} placeholder={t("all")} /></Field>
        <Field label={t("category")} className="w-44"><Select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
          <option value="">{t("all")}</option>{(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{lang === "ur" ? c.name_ur : c.name_en}</option>)}
        </Select></Field>
        <Field label={t("search")} className="min-w-40 flex-1"><Input className="h-12" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} /></Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("cashIn")} value={totalIn} money tone="good" />
        <Stat label={t("cashOut")} value={totalOut} money tone="bad" />
        <Stat label={t("net")} value={totalIn - totalOut} money />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-base">
          <thead className="bg-secondary"><tr>
            <th className="p-2 text-start">{t("date")}</th><th className="p-2 text-start">{t("type")}</th><th className="p-2 text-start">{t("detail")}</th>
            <th className="p-2 text-start">{t("owner")}</th><th className="p-2">{t("in")}</th><th className="p-2">{t("out")}</th><th className="no-print" />
          </tr></thead>
          <tbody>
            {rows.map((x) => {
              const p = party(x.party_id);
              return (
                <tr key={x.id} className={`border-t ${x.kind === "adjustment" ? "text-muted-foreground" : ""}`}>
                  <td className="num whitespace-nowrap p-2">{fmtDate(x.entry_date)}</td>
                  <td className="p-2">{t(txnKindLabel(x))}</td>
                  <td className="p-2">
                    {p && <Link href={`/party/${p.id}`} className="text-primary underline">{p.name}</Link>}
                    {x.expense_category_id && <span className="ms-1 rounded bg-muted px-1 text-sm">{catName(x.expense_category_id)}</span>}
                    {x.kind === "owner_transfer" && <span> → {ownerName(x.to_user_id)}</span>}
                    {x.note && <span className="text-sm text-muted-foreground"> — {x.note}</span>}
                    {x.receipt_url && <button className="no-print ms-2 text-sm text-primary underline" onClick={() => openReceipt(x.receipt_url!).catch((e) => toast.error(errMsg(e)))}>{t("receipt")}</button>}
                  </td>
                  <td className="p-2 text-sm">{ownerName(x.handler_user_id)} <span className="text-muted-foreground">({methodLabel(t, x.method)})</span></td>
                  <td className="num p-2 text-center text-success">{x.direction === "in" ? fmt(Number(x.amount)) : ""}</td>
                  <td className="num p-2 text-center text-destructive">{x.direction === "out" ? fmt(Number(x.amount)) : ""}</td>
                  <td className="no-print p-1"><ConfirmButton size="sm" variant="outline" onConfirm={() => voidTx(x.id)}>{t("remove")}</ConfirmButton></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="p-4"><Empty /></div>}
      </div>
      <p className="text-xs text-muted-foreground">{t("adjustmentNote")}</p>

      <CategoryManager cats={cats.data ?? []} />
    </div>
  );
}

function EntryForm() {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const cats = useExpenseCategories();
  const vendors = useParties("vendor");
  const blank = { type: "expense" as "expense" | "income" | "transfer", category: "", vendor: "", amount: "", date: today(), handler: "", to: "", method: "cash" as Method, note: "" };
  const [f, setF] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const amount = parseWhole(f.amount);
    if (!amount || amount <= 0) return void toast.error(t("wholeRupees"));
    if (!f.handler) return void toast.error(t(f.type === "income" ? "receivedBy" : "paidBy"));
    if (f.type === "expense" && !f.category) return void toast.error(t("category"));
    if (f.type === "transfer" && (!f.to || f.to === f.handler)) return void toast.error(t("chooseOtherOwner"));
    setBusy(true);
    try {
      const receipt_url = file ? await uploadReceipt(file) : null;
      const base = { entry_date: f.date, amount, method: f.method, handler_user_id: f.handler, note: f.note.trim() || null, receipt_url, created_by: await myId() };
      const row =
        f.type === "expense" ? { ...base, kind: "expense" as const, direction: "out" as const, category: "expense", expense_category_id: f.category, party_id: f.vendor || null }
        : f.type === "income" ? { ...base, kind: "other" as const, direction: "in" as const, category: "income", party_id: f.vendor || null }
        : { ...base, kind: "owner_transfer" as const, direction: "out" as const, category: "transfer", to_user_id: f.to };
      const { error } = await supabase.from("transactions").insert(row as TablesInsert<"transactions">);
      if (error) throw error;
      toast.success(t("saved"));
      setF({ ...blank, type: f.type, handler: f.handler, category: f.category, method: f.method, date: f.date });
      setFile(null);
      qc.invalidateQueries();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t("newEntry")} className="no-print">
      <div className="grid gap-3 md:grid-cols-4">
        <Field label={t("type")}><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}>
          <option value="expense">{t("expense")}</option><option value="income">{t("otherIncome")}</option><option value="transfer">{t("ownerTransfer")}</option>
        </Select></Field>
        <Field label={t("amount")}><NumInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} placeholder="0" /></Field>
        <Field label={t("date")}><DateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></Field>
        <Field label={t(f.type === "income" ? "receivedBy" : f.type === "transfer" ? "fromOwner" : "paidBy")}><OwnerSelect value={f.handler} onChange={(v) => setF((x) => ({ ...x, handler: v }))} /></Field>
        {f.type === "expense" && (
          <Field label={t("category")}><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="">—</option>{(cats.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{lang === "ur" ? c.name_ur : c.name_en}</option>)}
          </Select></Field>
        )}
        {f.type !== "transfer" && (
          <Field label={`${t("vendor")} (${t("optional")})`}><Select value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })}>
            <option value="">—</option>{(vendors.data ?? []).filter((v) => v.is_active).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select></Field>
        )}
        {f.type === "transfer" && <Field label={t("toOwner")}><OwnerSelect value={f.to} onChange={(v) => setF((x) => ({ ...x, to: v }))} /></Field>}
        <Field label={t("method")}><MethodSelect value={f.method} onChange={(v) => setF({ ...f, method: v })} /></Field>
        <Field label={t("note")} className="md:col-span-2"><Input className="h-12" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <Field label={t("receiptPhoto")}><Input className="h-12" type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <div className="flex items-end">
          <ConfirmButton size="lg" onConfirm={save} disabled={!f.amount || busy} description={`Rs ${fmt(parseWhole(f.amount) ?? 0)} — ${t("balanceChange")}`}>{t("save")}</ConfirmButton>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t("workerPaymentsHint")}</p>
    </Section>
  );
}

function CategoryManager({ cats }: { cats: Tables<"expense_categories">[] }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [en, setEn] = useState("");
  const [ur, setUr] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("expense_categories").insert({ name_en: en.trim(), name_ur: ur.trim(), sort_order: 100, created_by: await myId() });
    if (error) return void toast.error(error.message);
    setEn(""); setUr("");
    qc.invalidateQueries({ queryKey: ["expense-categories"] });
  }
  async function update(id: string, patch: Partial<Tables<"expense_categories">>) {
    const { error } = await supabase.from("expense_categories").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["expense-categories"] });
  }
  return (
    <Section title={t("categories")} className="no-print">
      <form onSubmit={add} className="mb-3 flex flex-wrap items-end gap-2">
        <Input className="h-11 w-40" placeholder="English" value={en} onChange={(e) => setEn(e.target.value)} required />
        <Input className="h-11 w-40" placeholder="اردو" value={ur} onChange={(e) => setUr(e.target.value)} required />
        <Button>{t("add")}</Button>
      </form>
      <div className="grid gap-2 md:grid-cols-3">
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg border p-2">
            <Input className="h-10" defaultValue={lang === "ur" ? c.name_ur : c.name_en}
              onBlur={(e) => { const v = e.target.value.trim(); const cur = lang === "ur" ? c.name_ur : c.name_en; if (v && v !== cur) update(c.id, lang === "ur" ? { name_ur: v } : { name_en: v }); }} />
            <Switch checked={c.is_active} onCheckedChange={(v) => update(c.id, { is_active: v })} />
          </div>
        ))}
      </div>
    </Section>
  );
}
