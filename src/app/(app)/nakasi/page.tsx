import type { Metadata } from "next";
import { KilnWeek } from "@/components/KilnWeek";

export const metadata: Metadata = { title: "Nakasi khatta", description: "Nakasi weekly register, earnings and kharcha." };

export default function Page() {
  return <KilnWeek stage="nakasi" />;
}
