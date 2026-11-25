"use client";

import { useParams } from "next/navigation";
import { CustomerAccount } from "@/views/customers";

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  return <CustomerAccount key={id} id={id} />;
}
