import type { Metadata } from "next";
import { Suspense } from "react";
import NewSale from "@/views/new-sale";

export const metadata: Metadata = { title: "New sale", description: "Create a sales invoice." };

export default function Page() {
  return <Suspense><NewSale /></Suspense>;
}
