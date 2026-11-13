import { createFileRoute } from "@tanstack/react-router";
import { KilnWeek } from "@/components/KilnWeek";

export const Route = createFileRoute("/_authenticated/nakasi")({
  head: () => ({ meta: [{ title: "Nakasi khatta — Mian Nawaz Bricks" }, { name: "description", content: "Nakasi weekly register, earnings and kharcha." }] }),
  component: () => <KilnWeek stage="nakasi" />,
});
