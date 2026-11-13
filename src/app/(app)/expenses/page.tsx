import type { Metadata } from "next";
import ExpensesPage from "@/views/expenses";

export const metadata: Metadata = { title: "Expense khatta", description: "Every payment in and out, in one central ledger." };

export default function Page() {
  return <ExpensesPage />;
}
