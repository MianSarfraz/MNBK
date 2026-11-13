import { createFileRoute } from "@tanstack/react-router";
import { PartyList } from "@/components/PartyList";

export const Route = createFileRoute("/_authenticated/patheer/")({
  head: () => ({ meta: [{ title: "Patheer — Mian Nawaz Bricks" }, { name: "description", content: "Patheer list and balances." }] }),
  component: () => <PartyList kind="patheer" />,
});
