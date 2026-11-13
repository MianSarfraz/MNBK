import type { Metadata } from "next";
import QualitiesPage from "@/views/qualities";

export const metadata: Metadata = { title: "Qualities", description: "Brick qualities and stock links." };

export default function Page() {
  return <QualitiesPage />;
}
