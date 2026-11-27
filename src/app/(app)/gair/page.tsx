import type { Metadata } from "next";
import GairPage from "@/views/gair";

export const metadata: Metadata = { title: "Gair check", description: "Kacha bricks loaded into each gair vs pakki bricks out." };

export default function Page() {
  return <GairPage />;
}
