import { createFileRoute, notFound } from "@tanstack/react-router";
import { PARTY_KINDS, type PartyKind } from "@/lib/data";
import { PartyList } from "@/components/PartyList";

export const Route = createFileRoute("/_authenticated/people/$kind")({
  head: () => ({ meta: [{ title: "People — Mian Nawaz Bricks" }, { name: "description", content: "Workers, employees, customers and vendors with balances." }] }),
  beforeLoad: ({ params }) => {
    if (!PARTY_KINDS.includes(params.kind as PartyKind)) throw notFound();
  },
  component: PeoplePage,
});

function PeoplePage() {
  const { kind } = Route.useParams();
  return <PartyList key={kind} kind={kind as PartyKind} />;
}
