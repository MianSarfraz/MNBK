import { redirect } from "next/navigation";

// The middleware sends signed-out visitors to /auth.
export default function Home() {
  redirect("/dashboard");
}
