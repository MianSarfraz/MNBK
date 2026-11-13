import type { Metadata } from "next";
import HistoryPage from "@/views/history";

export const metadata: Metadata = { title: "Edit history", description: "Every change with old and new values." };

export default function Page() {
  return <HistoryPage />;
}
