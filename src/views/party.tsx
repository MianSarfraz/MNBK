"use client";

import { useParams, useSearchParams } from "next/navigation";
import { PartyLedger } from "@/components/PartyLedger";

const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** Ledger / statement for any party; ?from=YYYY-MM-DD&to=YYYY-MM-DD opens a period statement. */
export default function PartyPage() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const from = isoDate(sp.get("from"));
  const to = isoDate(sp.get("to"));
  return <PartyLedger key={`${id}|${from}|${to}`} id={id} initialFrom={from} initialTo={to} />;
}
