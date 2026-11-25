import type { Metadata } from "next";
import SalesReports from "@/views/sales-reports";

export const metadata: Metadata = { title: "Sales reports", description: "Sales, production and customer balance reports." };

export default function Page() {
  return <SalesReports />;
}
