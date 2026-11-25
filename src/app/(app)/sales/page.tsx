import type { Metadata } from "next";
import SalesRegister from "@/views/sales-register";

export const metadata: Metadata = { title: "Sales register", description: "Every sale, one row per brick type, with stock checks." };

export default function Page() {
  return <SalesRegister />;
}
