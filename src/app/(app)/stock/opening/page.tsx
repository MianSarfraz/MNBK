import type { Metadata } from "next";
import OpeningStockPage from "@/views/opening-stock";

export const metadata: Metadata = { title: "Opening stock", description: "Bricks in the yard before using the app." };

export default function Page() {
  return <OpeningStockPage />;
}
