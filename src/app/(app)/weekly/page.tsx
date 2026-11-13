import type { Metadata } from "next";
import Weekly from "@/views/weekly";

export const metadata: Metadata = { title: "Weekly register", description: "Patheer weekly entry grid." };

export default function Page() {
  return <Weekly />;
}
