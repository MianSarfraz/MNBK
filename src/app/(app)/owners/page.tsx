import type { Metadata } from "next";
import OwnersPage from "@/views/owners";

export const metadata: Metadata = { title: "Owners", description: "Each brother's payments, receipts, net position and cash in hand." };

export default function Page() {
  return <OwnersPage />;
}
