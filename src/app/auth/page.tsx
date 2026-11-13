import type { Metadata } from "next";
import AuthPage from "@/views/auth";

export const metadata: Metadata = { title: "Sign in", description: "Owner sign-in for the Mian Nawaz Bricks kiln khatta." };

export default function Page() {
  return <AuthPage />;
}
