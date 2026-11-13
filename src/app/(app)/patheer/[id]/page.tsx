import type { Metadata } from "next";
import { Suspense } from "react";
import PartyPage from "@/views/party";

export const metadata: Metadata = { title: "Patheer ledger", description: "Patheer khatta and settlement." };

export default function Page() {
  return <Suspense><PartyPage /></Suspense>;
}
