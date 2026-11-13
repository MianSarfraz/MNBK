import type { Metadata } from "next";
import Dashboard from "@/views/dashboard";

export const metadata: Metadata = { title: "Dashboard", description: "Current week summary and balances." };

export default function Page() {
  return <Dashboard />;
}
