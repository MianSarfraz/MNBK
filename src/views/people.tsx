"use client";

import { notFound, useParams } from "next/navigation";
import { PARTY_KINDS, type PartyKind } from "@/lib/data";
import { PartyList } from "@/components/PartyList";

export default function PeoplePage() {
  const { kind } = useParams<{ kind: string }>();
  if (!PARTY_KINDS.includes(kind as PartyKind)) notFound();
  return <PartyList key={kind} kind={kind as PartyKind} />;
}
