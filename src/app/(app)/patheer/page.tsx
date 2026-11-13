import type { Metadata } from "next";
import { PartyList } from "@/components/PartyList";

export const metadata: Metadata = { title: "Patheer", description: "Patheer list and balances." };

export default function Page() {
  return <PartyList kind="patheer" />;
}
