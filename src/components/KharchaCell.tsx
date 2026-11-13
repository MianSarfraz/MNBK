"use client";

import { useState } from "react";
import { fmt, useT } from "@/lib/i18n";
import { parseWhole } from "@/lib/kiln-math";
import { today } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/ConfirmButton";
import { OwnerSelect } from "@/components/kit";

/** Suggested weekly kharcha (editable) + date + who paid + confirm. */
export function KharchaCell({ amount, disabled, onGive }: {
  amount: number; disabled: boolean; onGive: (a: number, h: string, date: string) => Promise<boolean> | void;
}) {
  const { t } = useT();
  const [val, setVal] = useState("");
  const [h, setH] = useState("");
  const [date, setDate] = useState(today());
  const a = val ? parseWhole(val) ?? 0 : amount;
  return (
    <div className="flex w-32 flex-col gap-1">
      <Input className="num h-9 text-center" inputMode="numeric" placeholder={fmt(amount)} value={val} onChange={(e) => setVal(e.target.value)} />
      <Input className="h-9 px-1 text-xs" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("date")} />
      <OwnerSelect className="h-9 text-xs" value={h} onChange={setH} placeholder={t("paidBy")} />
      <ConfirmButton size="sm" disabled={a <= 0 || (disabled && !val)} description={`${t("kharcha")}: Rs ${fmt(a)} — ${t("balanceChange")}`}
        onConfirm={async () => { if (await onGive(a, h, date || today())) setVal(""); }}>
        {t("giveKharcha")}
      </ConfirmButton>
    </div>
  );
}
