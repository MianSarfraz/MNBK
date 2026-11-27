import type { Metadata } from "next";
import { Suspense } from "react";
import BillPage from "@/views/bill";

export const metadata: Metadata = { title: "Invoice generator", description: "One bill for one or more sales." };

export default function Page() {
  return (
    <Suspense>
      <BillPage />
    </Suspense>
  );
}
