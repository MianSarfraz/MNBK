"use client";

import { useT } from "@/lib/i18n";

/** Balance > 0: we owe the party. Balance < 0: the party owes us. */
export function BalanceBadge({ balance, kind }: { balance: number; kind?: string }) {
  const { t } = useT();
  if (balance === 0) return <span className="rounded bg-muted px-2 text-sm">{t("settled")}</span>;
  const customer = kind === "customer";
  return balance > 0 ? (
    <span className="rounded bg-warning px-2 text-sm text-warning-foreground">{t(customer ? "weOweCustomer" : "weOwe")}</span>
  ) : (
    <span className="rounded bg-success px-2 text-sm text-success-foreground">{t(customer ? "customerOwes" : "heOwes")}</span>
  );
}
