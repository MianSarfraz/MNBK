import { createFileRoute } from "@tanstack/react-router";
import { PartyLedger } from "@/components/PartyLedger";

export const Route = createFileRoute("/_authenticated/patheer/$id")({
  head: () => ({ meta: [{ title: "Patheer ledger — Mian Nawaz Bricks" }, { name: "description", content: "Patheer khatta and settlement." }] }),
  component: PatheerLedger,
});

function PatheerLedger() {
  const { id } = Route.useParams();
  return <PartyLedger key={id} id={id} />;
}
