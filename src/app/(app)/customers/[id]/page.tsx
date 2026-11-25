import type { Metadata } from "next";
import CustomerPage from "@/views/customer";

export const metadata: Metadata = { title: "Customer account", description: "Purchases, payments and outstanding balance." };

export default function Page() {
  return <CustomerPage />;
}
