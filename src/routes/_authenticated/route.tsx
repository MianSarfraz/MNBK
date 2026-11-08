import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useT, type Key } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { LangToggle } from "@/components/LangToggle";

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

const nav: { to: "/dashboard" | "/weekly" | "/patheer" | "/seasons" | "/qualities"; k: Key }[] = [
  { to: "/dashboard", k: "dashboard" },
  { to: "/weekly", k: "weekly" },
  { to: "/patheer", k: "patheer" },
  { to: "/seasons", k: "seasons" },
  { to: "/qualities", k: "qualities" },
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
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-2">
          <span className="text-xl font-bold text-sidebar-primary">{t("appName")}</span>
          <nav className="flex flex-1 flex-wrap gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-md px-3 py-1.5 text-base hover:bg-sidebar-accent"
                activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground" }}
              >
                {t(n.k)}
              </Link>
            ))}
          </nav>
          <LangToggle />
          <Button variant="secondary" size="sm" onClick={signOut}>{t("signOut")}</Button>
        </div>
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
