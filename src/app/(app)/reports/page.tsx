import type { Metadata } from "next";
import ReportsPage from "@/views/reports";

export const metadata: Metadata = { title: "Reports", description: "Season profit and loss, outstanding balances, statements and exports." };

export default function Page() {
  return <ReportsPage />;
}
