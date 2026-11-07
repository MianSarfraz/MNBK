import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LangToggle } from "@/components/LangToggle";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Mian Nawaz Bricks" },
      { name: "description", content: "Owner sign-in for the Mian Nawaz Bricks kiln khatta." },
      { property: "og:title", content: "Sign in — Mian Nawaz Bricks" },
      { property: "og:description", content: "Owner sign-in for the kiln khatta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard" });
        else toast.success(t("checkEmail"));
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end"><LangToggle /></div>
        <div className="register-paper rounded-xl border-2 border-primary/40 p-8 shadow-lg">
          <h1 className="text-center text-3xl font-bold text-primary">{t("appName")}</h1>
          <form onSubmit={submit} className="mt-8 space-y-5">
            {mode === "up" && (
              <div className="space-y-2">
                <Label className="text-lg">{t("fullName")}</Label>
                <Input className="h-12 text-lg" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-lg">{t("email")}</Label>
              <Input className="h-12 text-lg" dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label className="text-lg">{t("password")}</Label>
              <Input className="h-12 text-lg" dir="ltr" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" size="lg" className="h-14 w-full text-xl" disabled={busy}>
              {mode === "in" ? t("signIn") : t("signUp")}
            </Button>
          </form>
          <button type="button" className="mt-6 w-full text-center text-primary underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? t("signUp") : t("signIn")}
          </button>
        </div>
      </div>
    </div>
  );
}
