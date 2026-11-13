import { useState } from "react";
import { fmt, useT } from "@/lib/i18n";
import { parseWhole } from "@/lib/kiln-math";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ConfirmButton";
import { OwnerSelect } from "@/components/kit";

/** Suggested weekly kharcha (editable) + who paid + confirm. */
export function KharchaCell({ amount, disabled, onGive }: { amount: number; disabled: boolean; onGive: (a: number, h: string) => Promise<boolean> | void }) {
  const { t } = useT();
  const [val, setVal] = useState("");
  const [h, setH] = useState("");
  const a = val ? parseWhole(val) ?? 0 : amount;
  return (
    <div className="space-y-1">
      <Input className="num h-10 w-28 text-center" inputMode="numeric" placeholder={fmt(amount)} value={val} onChange={(e) => setVal(e.target.value)} disabled={disabled && !val} />
      <OwnerSelect className="h-9 w-28 text-xs" value={h} onChange={setH} placeholder={t("paidBy")} />
      <ConfirmButton size="sm" disabled={a <= 0 || (disabled && !val)} description={`${t("kharcha")}: Rs ${fmt(a)} — ${t("balanceChange")}`}
        onConfirm={async () => { if (await onGive(a, h)) setVal(""); }}>
        {t("giveKharcha")}
      </ConfirmButton>
    </div>
  );
}
