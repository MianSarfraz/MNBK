import type { Metadata } from "next";
import SeasonsPage from "@/views/seasons";

export const metadata: Metadata = { title: "Seasons", description: "Seasons and weeks." };

export default function Page() {
  return <SeasonsPage />;
}
