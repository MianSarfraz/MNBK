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
