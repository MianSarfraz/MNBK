import { createFileRoute } from "@tanstack/react-router";
import { KilnWeek } from "@/components/KilnWeek";

export const Route = createFileRoute("/_authenticated/rehra")({
  head: () => ({ meta: [{ title: "Rehra khatta — Mian Nawaz Bricks" }, { name: "description", content: "Rehra weekly register, earnings and kharcha." }] }),
  component: () => <KilnWeek stage="rehra" />,
});
