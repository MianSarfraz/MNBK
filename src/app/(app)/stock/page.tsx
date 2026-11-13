import type { Metadata } from "next";
import StockPage from "@/views/stock";

export const metadata: Metadata = { title: "Stock", description: "Finished and raw brick stock with reconciliation." };

export default function Page() {
  return <StockPage />;
}
