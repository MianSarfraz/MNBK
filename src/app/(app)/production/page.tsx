import type { Metadata } from "next";
import ProductionPage from "@/views/production";

export const metadata: Metadata = { title: "Production register", description: "Bricks out of the kiln after each firing." };

export default function Page() {
  return <ProductionPage />;
}
