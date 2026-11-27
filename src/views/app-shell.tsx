"use client";

import { Logo } from "@/components/BillHeader";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, Home, LogOut, Menu, Receipt, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useT, type Key } from "@/lib/i18n";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PATHEER } from "@/lib/features";

type NavItem = { href: string; k: Key };
const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Sales & stock", items: [
    { href: "/dashboard", k: "dashboard" }, { href: "/sales", k: "salesRegister" }, { href: "/payments", k: "paymentsRegister" },
    { href: "/customers", k: "customers" }, { href: "/stock", k: "stockSummary" }, { href: "/production", k: "productionRegister" },
    { href: "/stock/opening", k: "openingStock" }, { href: "/sales-reports", k: "salesReports" }, { href: "/sales/bill", k: "invoiceGenerator" }, { href: "/sales/invoices", k: "invoices" },
  ] },
  { title: "Kiln work", items: [...(PATHEER ? [{ href: "/weekly", k: "weekly" as Key }] : []), { href: "/rehra", k: "rehra" }, { href: "/gair", k: "gairCheck" }, { href: "/nakasi", k: "nakasi" }, ...(PATHEER ? [{ href: "/patheer", k: "patheer" as Key }] : []), { href: "/people/employee", k: "employees" }] },
  { title: "Money", items: [{ href: "/expenses", k: "expenseKhatta" }, { href: "/owners", k: "ownersTitle" }, { href: "/people/vendor", k: "vendors" }, { href: "/reports", k: "reports" }] },
  { title: "Settings", items: [{ href: "/qualities", k: "qualities" }, { href: "/seasons", k: "seasons" }, { href: "/history", k: "history" }] },
];
const DESKTOP: NavItem[] = [
  { href: "/dashboard", k: "dashboard" }, { href: "/sales", k: "sales" }, { href: "/payments", k: "paymentsShort" }, { href: "/customers", k: "customers" },
  { href: "/stock", k: "stock" }, { href: "/production", k: "production" }, { href: "/sales-reports", k: "reports" }, { href: PATHEER ? "/weekly" : "/rehra", k: "kilnWork" },
];
const TABS = [
  { href: "/dashboard", k: "home" as Key, icon: Home },
  { href: "/sales", k: "sales" as Key, icon: Receipt },
  { href: "/stock", k: "stock" as Key, icon: Boxes },
  { href: "/customers", k: "customers" as Key, icon: Users },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Signed-in frame: header, navigation, and the owner check (the first two accounts claim owner). */
export default function AppShell({ children }: { children: ReactNode }) {
  const { t } = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [more, setMore] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return router.replace("/auth");
      const meta = data.user.user_metadata as { full_name?: string } | undefined;
      const { data: owner } = await supabase.rpc("claim_owner_role");
      if (alive) { setIsOwner(!!owner); setName(meta?.full_name ?? ""); }
    })();
    return () => { alive = false; };
  }, [router]);

  useEffect(() => setMore(false), [pathname]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.replace("/auth");
    router.refresh();
  }

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="no-print sticky top-0 z-30 border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-10 max-w-7xl items-center gap-3 px-3">
          <Link href="/dashboard" className="flex items-center gap-1.5 truncate text-base font-bold text-sidebar-primary"><Logo size={26} />{t("appName")}</Link>
          <nav className="hidden min-w-0 flex-1 gap-0.5 overflow-x-auto md:flex">
            {DESKTOP.map((n) => (
              <Link key={n.href} href={n.href}
                className={`whitespace-nowrap rounded-md px-2.5 py-1 text-sm hover:bg-sidebar-accent ${isActive(pathname, n.href) ? "bg-sidebar-primary text-sidebar-primary-foreground" : ""}`}>
                {t(n.k)}
              </Link>
            ))}
            <button onClick={() => setMore(true)} className="whitespace-nowrap rounded-md px-2.5 py-1 text-sm hover:bg-sidebar-accent">{t("more")} ▾</button>
          </nav>
          <div className="ms-auto flex items-center gap-2 md:ms-0">
            {name && <span className="hidden text-xs opacity-80 sm:inline">{name}</span>}
            <button onClick={signOut} className="rounded-md p-2 hover:bg-sidebar-accent" aria-label={t("signOut")} title={t("signOut")}><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4">
        {isOwner === null ? (
          <div className="p-8 text-center text-muted-foreground">…</div>
        ) : isOwner ? (
          children
        ) : (
          <div className="mx-auto mt-16 max-w-sm rounded-xl border bg-card p-4 text-center">
            <h1 className="text-xl font-bold text-destructive">{t("noAccess")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("noAccessHelp")}</p>
          </div>
        )}
      </main>

      {/* Phone: bottom tab bar */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map(({ href, k, icon: Icon }) => {
          const on = isActive(pathname, href);
          return (
            <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${on ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="h-5 w-5" />{t(k)}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
          <Menu className="h-5 w-5" />{t("more")}
        </button>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader><SheetTitle>{t("appName")}</SheetTitle></SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {g.items.map((n) => (
                    <Link key={n.href} href={n.href}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${isActive(pathname, n.href) ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}>
                      {t(n.k)}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
