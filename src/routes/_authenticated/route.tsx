import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useT, type Key } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LangToggle, NumeralsToggle } from "@/components/LangToggle";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: isOwner } = await supabase.rpc("claim_owner_role");
    return { isOwner: !!isOwner };
  },
  component: Layout,
});

type NavItem =
  | { to: "/dashboard" | "/weekly" | "/patheer" | "/rehra" | "/nakasi" | "/sales" | "/stock" | "/expenses" | "/owners" | "/reports" | "/seasons" | "/qualities" | "/history"; k: Key }
  | { to: "/people/$kind"; kind: "employee" | "customer"; k: Key };
const nav: NavItem[] = [
  { to: "/dashboard", k: "dashboard" },
  { to: "/weekly", k: "weekly" },
  { to: "/patheer", k: "patheer" },
  { to: "/rehra", k: "rehra" },
  { to: "/nakasi", k: "nakasi" },
  { to: "/sales", k: "sales" },
  { to: "/people/$kind", kind: "customer", k: "customers" },
  { to: "/stock", k: "stock" },
  { to: "/expenses", k: "expenseKhatta" },
  { to: "/people/$kind", kind: "employee", k: "employees" },
  { to: "/owners", k: "ownersTitle" },
  { to: "/reports", k: "reports" },
  { to: "/seasons", k: "seasons" },
  { to: "/qualities", k: "qualities" },
  { to: "/history", k: "history" },
];

function Layout() {
  const { isOwner } = Route.useRouteContext();
  const { t } = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-30 bg-sidebar text-sidebar-foreground shadow">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 pt-2">
          <Link to="/dashboard" className="text-xl font-bold text-sidebar-primary">{t("appName")}</Link>
          <div className="ms-auto flex items-center gap-2">
            <NumeralsToggle />
            <LangToggle />
            <Button variant="secondary" size="sm" onClick={signOut}>{t("signOut")}</Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto whitespace-nowrap px-3 py-2 [scrollbar-width:thin]">
          {nav.map((n) => (
            <Link
              key={n.k}
              {...(n.to === "/people/$kind" ? { to: n.to, params: { kind: n.kind } } : { to: n.to })}
              className="rounded-md px-3 py-1.5 text-base hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground" }}
            >
              {t(n.k)}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-5">
        {isOwner ? (
          <Outlet />
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
