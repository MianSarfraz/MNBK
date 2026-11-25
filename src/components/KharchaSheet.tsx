"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt, useT } from "@/lib/i18n";
import { parseWhole } from "@/lib/kiln-math";
import { myId, today, useOwners } from "@/lib/data";
import { ConfirmButton } from "@/components/ConfirmButton";
import { LetterRow, Sheet } from "@/components/sheet";

export type KharchaRowData = { id: string; name: string; bricks: number; earn: number; suggested: number; noRate?: boolean };

/** Weekly kharcha as a sheet: one row per worker, suggested amount pre-filled from the kharcha rate. */
export function KharchaSheet({ rows, readOnly, onGive, title }: {
  rows: KharchaRowData[]; readOnly: boolean; title?: string;
  onGive: (pid: string, amount: number, handler: string, date: string) => Promise<boolean>;
}) {
  const { t } = useT();
  const owners = useOwners();
  const [me, setMe] = useState("");
  useEffect(() => { myId().then(setMe).catch(() => {}); }, []);
  if (!rows.length) return null;
  const sum = (k: "bricks" | "earn" | "suggested") => rows.reduce((s, r) => s + r[k], 0);
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold">{title ?? t("weekTotalsKharcha")}</div>
      <Sheet minWidth={760}>
        <thead>
          <LetterRow cols={8} />
          <tr>
            <th className="rn">#</th><th>{t("name")}</th><th className="n w-28">{t("bricksCol")}</th><th className="n w-28">{t("earnings")}</th>
            <th className="n w-28">{t("suggested")}</th><th className="n w-28">{t("kharcha")}</th><th className="w-36">{t("date")}</th><th className="w-40">{t("paidBy")}</th><th className="w-28" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => <Row key={r.id} n={i + 1} r={r} readOnly={readOnly} owners={owners.data ?? []} me={me} onGive={onGive} />)}
          <tr className="total">
            <td className="rn" /><td>{t("total")}</td><td className="n num">{fmt(sum("bricks"))}</td><td className="n num">{fmt(sum("earn"))}</td>
            <td className="n num">{fmt(sum("suggested"))}</td><td colSpan={4} />
          </tr>
        </tbody>
      </Sheet>
    </div>
  );
}

function Row({ n, r, readOnly, owners, me, onGive }: {
  n: number; r: KharchaRowData; readOnly: boolean; owners: { id: string; display_name: string }[]; me: string;
  onGive: (pid: string, amount: number, handler: string, date: string) => Promise<boolean>;
}) {
  const { t } = useT();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [picked, setBy] = useState("");
  const by = picked || me;
  const a = amount ? parseWhole(amount) ?? 0 : r.suggested;
  return (
    <tr>
      <td className="rn">{n}</td>
      <td><Link href={`/party/${r.id}`} className="hover:underline">{r.name}</Link>{r.noRate && <span className="ms-1 text-[11px] text-destructive">{t("missingRate")}</span>}</td>
      <td className="n num">{fmt(r.bricks)}</td>
      <td className="n num font-semibold text-primary">{fmt(r.earn)}</td>
      <td className="n num ro">{fmt(r.suggested)}</td>
      <td className="c"><input className="cell n num" inputMode="numeric" placeholder={fmt(r.suggested)} value={amount} disabled={readOnly}
        aria-label={`${r.name} ${t("kharcha")}`} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setAmount(e.target.value)} /></td>
      <td className="c"><input className="cell" type="date" value={date} disabled={readOnly} onChange={(e) => setDate(e.target.value)} /></td>
      <td className="c">
        <select className="cell" value={by} disabled={readOnly} onChange={(e) => setBy(e.target.value)}>
          <option value="">—</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.display_name}</option>)}
        </select>
      </td>
      <td className="px-1">
        <ConfirmButton size="sm" disabled={readOnly || a <= 0} description={`${r.name} — ${t("kharcha")}: Rs ${fmt(a)} — ${t("balanceChange")}`}
          onConfirm={async () => { if (await onGive(r.id, a, by, date || today())) setAmount(""); }}>
          {t("giveKharcha")}
        </ConfirmButton>
      </td>
    </tr>
  );
}
