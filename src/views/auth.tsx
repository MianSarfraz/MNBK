"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The two partners; the name chosen at sign-up is shown on every "paid by / received by" entry. */
export const OWNERS = ["Sarfraz", "Muhammad Nawaz"] as const;

export default function AuthPage() {
  const { t } = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState<string>(OWNERS[0]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/dashboard");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/dashboard");
          router.refresh();
        }
        else toast.success(t("checkEmail"));
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-4 shadow-sm">
        <h1 className="text-center text-2xl font-bold text-primary">{t("appName")}</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">{mode === "in" ? t("signInHelp") : t("signUpHelp")}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "up" && (
            <div className="space-y-1">
              <Label>{t("whoAreYou")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {OWNERS.map((o) => (
                  <button key={o} type="button" onClick={() => setName(o)}
                    className={`h-11 rounded-lg border text-sm font-medium ${name === o ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>{t("email")}</Label>
            <Input className="h-11" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>{t("password")}</Label>
            <Input className="h-11" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="h-11 w-full text-sm" disabled={busy}>
            {busy ? "…" : mode === "in" ? t("signIn") : t("signUp")}
          </Button>
        </form>
        <button type="button" className="mt-4 w-full text-center text-sm text-primary underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? t("needAccount") : t("haveAccount")}
        </button>
      </div>
    </div>
  );
}
