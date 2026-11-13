import type { ReactNode } from "react";
import AppShell from "@/views/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
