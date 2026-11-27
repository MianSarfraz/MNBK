import type { Metadata } from "next";
import FuelPage from "@/views/fuel";

export const metadata: Metadata = { title: "Fuel khatta", description: "Coal, wood and boora from agents: purchases, payments and tabs." };

export default function Page() {
  return <FuelPage />;
}
