import { createFileRoute } from "@tanstack/react-router";
import { PartyLedger } from "@/components/PartyLedger";

const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export const Route = createFileRoute("/_authenticated/party/$id")({
  head: () => ({ meta: [{ title: "Ledger — Mian Nawaz Bricks" }, { name: "description", content: "Running account, statement and settlement." }] }),
  validateSearch: (s: Record<string, unknown>): { from?: string | undefined; to?: string | undefined } => ({ from: isoDate(s["from"]), to: isoDate(s["to"]) }),
  component: LedgerPage,
});

function LedgerPage() {
  const { id } = Route.useParams();
  const { from, to } = Route.useSearch();
  return <PartyLedger key={`${id}|${from}|${to}`} id={id} initialFrom={from} initialTo={to} />;
}
