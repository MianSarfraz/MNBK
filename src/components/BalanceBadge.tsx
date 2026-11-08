import { useT } from "@/lib/i18n";

export function BalanceBadge({ balance }: { balance: number }) {
  const { t } = useT();
  if (balance === 0) return <span className="rounded bg-muted px-2 text-sm">{t("settled")}</span>;
  return balance > 0 ? (
    <span className="rounded bg-warning px-2 text-sm text-warning-foreground">{t("weOwe")}</span>
  ) : (
    <span className="rounded bg-success px-2 text-sm text-success-foreground">{t("heOwes")}</span>
  );
}
