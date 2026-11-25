import type { Metadata } from "next";
import PaymentsRegister from "@/views/payments";

export const metadata: Metadata = { title: "Payments register", description: "Money received from customers." };

export default function Page() {
  return <PaymentsRegister />;
}
