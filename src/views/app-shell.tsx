"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useT, type Key } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LangToggle, NumeralsToggle } from "@/components/LangToggle";

const nav: { href: string; k: Key }[] = [
  { href: "/dashboard", k: "dashboard" },
  { href: "/weekly", k: "weekly" },
  { href: "/patheer", k: "patheer" },
  { href: "/rehra", k: "rehra" },
  { href: "/nakasi", k: "nakasi" },
  { href: "/sales", k: "sales" },
  { href: "/people/customer", k: "customers" },
  { href: "/stock", k: "stock" },
  { href: "/expenses", k: "expenseKhatta" },
  { href: "/people/employee", k: "employees" },
  { href: "/owners", k: "ownersTitle" },
  { href: "/reports", k: "reports" },
  { href: "/seasons", k: "seasons" },
  { href: "/qualities", k: "qualities" },
  { href: "/history", k: "history" },
];

/** Signed-in frame: header, navigation, and the owner check (the first two accounts claim owner). */
export default function AppShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.replace("/auth");
      const { data: owner } = await supabase.rpc("claim_owner_role");
      if (alive) setIsOwner(!!owner);
    })();
    return () => { alive = false; };
  }, [router]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.replace("/auth");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 bg-sidebar text-sidebar-foreground shadow">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 pt-2">
          <Link href="/dashboard" className="text-xl font-bold text-sidebar-primary">{t("appName")}</Link>
          <div className="ms-auto flex items-center gap-2">
            <NumeralsToggle />
            <LangToggle />
            <Button variant="secondary" size="sm" onClick={signOut}>{t("signOut")}</Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto whitespace-nowrap px-3 py-2 [scrollbar-width:thin]">
          {nav.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-base hover:bg-sidebar-accent ${active ? "bg-sidebar-primary text-sidebar-primary-foreground" : ""}`}>
                {t(n.k)}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-5">
        {isOwner === null ? (
          <div className="p-8 text-center text-muted-foreground">…</div>
        ) : isOwner ? (
          children
        ) : (
          <div className="mx-auto mt-20 max-w-md rounded-xl border bg-card p-8 text-center">
            <h1 className="text-2xl font-bold text-destructive">{t("noAccess")}</h1>
            <p className="mt-3 text-muted-foreground">{t("noAccessHelp")}</p>
          </div>
        )}
      </main>
    </div>
  );
}
