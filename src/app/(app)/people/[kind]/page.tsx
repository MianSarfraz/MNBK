import type { Metadata } from "next";
import PeoplePage from "@/views/people";

export const metadata: Metadata = { title: "People", description: "Workers, employees, customers and vendors with balances." };

export default function Page() {
  return <PeoplePage />;
}
