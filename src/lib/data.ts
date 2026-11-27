import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export async function myId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export function useOwners() {
  return useQuery({
    queryKey: ["owners"],
    queryFn: async () => {
      const { data: roles, error } = await supabase.from("user_roles").select("user_id").eq("role", "owner");
      if (error) throw error;
      const ids = (roles ?? []).map((r) => r.user_id);
      const { data, error: e2 } = await supabase.from("profiles").select("id, display_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      if (e2) throw e2;
      return data ?? [];
    },
  });
}

export function useSeasons() {
  return useQuery({
    queryKey: ["seasons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("seasons").select("*").is("deleted_at", null).order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWeeks(seasonId: string | undefined) {
  return useQuery({
    queryKey: ["weeks", seasonId],
    enabled: !!seasonId,
    queryFn: async () => {
      const { data, error } = await supabase.from("weeks").select("*").eq("season_id", seasonId!).order("start_date");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePatheers() {
  return useQuery({
    queryKey: ["parties", "patheer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parties").select("*").eq("kind", "patheer").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRates() {
  return useQuery({
    queryKey: ["rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("party_rates").select("*").is("deleted_at", null).order("effective_from");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLedgers() {
  return useQuery({
    queryKey: ["ledgers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("party_ledger").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export type PartyKind = "patheer" | "rehra" | "nakasi" | "employee" | "customer" | "vendor";
export const PARTY_KINDS: PartyKind[] = ["patheer", "rehra", "nakasi", "employee", "customer", "vendor"];
export const WORKER_KINDS: PartyKind[] = ["patheer", "rehra", "nakasi"];

export function useParties(kind?: PartyKind) {
  return useQuery({
    queryKey: ["parties", kind ?? "all"],
    queryFn: async () => {
      let q = supabase.from("parties").select("*").is("deleted_at", null).order("name");
      if (kind) q = q.eq("kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useQualities() {
  return useQuery({
    queryKey: ["qualities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("qualities").select("*").is("deleted_at", null).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("*").is("deleted_at", null).order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Fetch every row of a table/view, paging past the 1000-row API limit. */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}

/** The season whose date range contains the date (latest start wins). */
export function seasonForDate<S extends { id: string; start_date: string; end_date: string }>(seasons: S[], date: string): S | undefined {
  return seasons.filter((s) => s.start_date <= date && s.end_date >= date).sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
}

export function errMsg(err: unknown) {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Upload a receipt photo to the private bucket; returns the stored path. */
export async function uploadReceipt(file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${today().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

/** Open a stored receipt photo using a short-lived signed URL. */
export async function openReceipt(path: string) {
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 300);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

// ---------- Sales & stock ----------
/** The active brick types (owner-editable on the Qualities screen), in order. */
export function useBrickTypes() {
  const q = useQualities();
  return { ...q, data: (q.data ?? []).filter((x) => x.kind === "nakasi" && x.is_active).sort((a, b) => a.sort_order - b.sort_order) };
}

/** Sale-only items sold by the load (roray / broken bricks by trolley or rehra). Never stock-tracked. */
export function useRoray() {
  const q = useQualities();
  return { ...q, data: (q.data ?? []).filter((x) => x.kind === "sale" && x.unit === "load" && x.is_active).sort((a, b) => a.sort_order - b.sort_order) };
}

/** Add a sale-only item priced per load. Returns an error message, or null when saved. */
export async function addRoray(name: string, existing: (Quality & { unit?: string })[]): Promise<string | null> {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) return "Type a name";
  if (existing.some((q) => q.kind === "sale" && !q.deleted_at && q.name_en.trim().toLowerCase() === n.toLowerCase())) return `"${n}" already exists`;
  const sort_order = existing.filter((q) => q.unit === "load").reduce((m, q) => Math.max(m, q.sort_order), 200) + 1;
  const { error } = await supabase.from("qualities").insert({ name_en: n, name_ur: n, kind: "sale", category: "other", unit: "load", is_active: true, sort_order, created_by: await myId() });
  return error ? error.message : null;
}

type Quality = { id: string; name_en: string; kind: string; sort_order: number; deleted_at?: string | null };
type BrickCategory = "normal" | "nine_t" | "special" | "other";

/** Add a new stock-tracked brick type at the end of the list. Returns an error message, or null when saved. */
export async function addBrickType(name: string, category: BrickCategory, existing: Quality[]): Promise<string | null> {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n) return "Type a name";
  const types = existing.filter((q) => q.kind === "nakasi" && !q.deleted_at);
  if (types.some((q) => q.name_en.trim().toLowerCase() === n.toLowerCase())) return `"${n}" already exists`;
  const sort_order = types.reduce((m, q) => Math.max(m, q.sort_order), 0) + 1;
  const { error } = await supabase.from("qualities").insert({ name_en: n, name_ur: n, kind: "nakasi", category, is_active: true, sort_order, created_by: await myId() });
  return error ? error.message : null;
}

/** Every gair (kiln round): kacha loaded vs pakki out. */
export function useGairs() {
  return useQuery({
    queryKey: ["gair-check"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gair_check").select("*").order("last_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Kacha store balance per type (bricks / 9t tiles). */
export function useKachaStock() {
  return useQuery({
    queryKey: ["raw-store-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_store_stock").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStock() {
  return useQuery({
    queryKey: ["finished-stock"],
    queryFn: async () => {
      const { data, error } = await supabase.from("finished_stock").select("*").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCustomerAccounts() {
  return useQuery({
    queryKey: ["customer-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_accounts").select("*").order("ref_no");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaleLines(from: string, to: string) {
  return useQuery({
    queryKey: ["sale-lines", from, to],
    queryFn: () => fetchAll<import("@/integrations/supabase/types").Tables<"sale_lines">>((a, b) =>
      supabase.from("sale_lines").select("*").gte("entry_date", from).lte("entry_date", to).order("entry_date").order("invoice_no").range(a, b)),
  });
}

export const saleId = (n: number | null | undefined) => (n == null ? "—" : `S-${String(n).padStart(4, "0")}`);
export const paymentId = (n: number | null | undefined) => (n == null ? "—" : `P-${String(n).padStart(4, "0")}`);
export const customerId = (n: number | null | undefined) => (n == null ? "—" : `C-${String(n).padStart(3, "0")}`);
