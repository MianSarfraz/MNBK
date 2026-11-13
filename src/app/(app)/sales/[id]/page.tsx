import type { Metadata } from "next";
import InvoicePage from "@/views/invoice";

export const metadata: Metadata = { title: "Invoice", description: "Printable sales invoice and receipts." };

export default function Page() {
  return <InvoicePage />;
}
