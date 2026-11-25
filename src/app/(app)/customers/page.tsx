import type { Metadata } from "next";
import CustomersPage from "@/views/customers";

export const metadata: Metadata = { title: "Customers", description: "Customer master with balances." };

export default function Page() {
  return <CustomersPage />;
}
