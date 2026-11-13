import type { Metadata } from "next";
import SalesList from "@/views/sales";

export const metadata: Metadata = { title: "Sales", description: "Sales invoices and receipts." };

export default function Page() {
  return <SalesList />;
}
