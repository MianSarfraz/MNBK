import type { Metadata } from "next";
import { Suspense } from "react";
import PartyPage from "@/views/party";

export const metadata: Metadata = { title: "Ledger", description: "Running account, statement and settlement." };

export default function Page() {
  return <Suspense><PartyPage /></Suspense>;
}
