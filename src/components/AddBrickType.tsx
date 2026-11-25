"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { addBrickType, useQualities } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/kit";

type Cat = "normal" | "nine_t" | "special" | "other";

/** One-line form: type a name, pick a group, Add → a new brick type with its own stock. */
export function AddBrickType({ className }: { className?: string }) {
  const { t } = useT();
  const qc = useQueryClient();
  const qualities = useQualities();
  const [name, setName] = useState("");
  const [cat, setCat] = useState<Cat>("normal");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await addBrickType(name, cat, qualities.data ?? []).catch((x: Error) => x.message);
    setBusy(false);
    if (err) return void toast.error(err);
    toast.success(t("brickTypeAdded"));
    setName("");
    qc.invalidateQueries({ queryKey: ["qualities"] });
    qc.invalidateQueries({ queryKey: ["finished-stock"] });
  }

  return (
    <form onSubmit={submit} className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <Input className="h-10 min-w-40 flex-1" placeholder={t("newBrickTypeName")} value={name} onChange={(e) => setName(e.target.value)} aria-label={t("addBrickType")} />
      <Select className="w-28" value={cat} onChange={(e) => setCat(e.target.value as Cat)} aria-label={t("category")}>
        <option value="normal">{t("catNormal")}</option><option value="nine_t">{t("cat9t")}</option>
        <option value="special">{t("catSpecial")}</option><option value="other">{t("catOther")}</option>
      </Select>
      <Button type="submit" disabled={busy || !name.trim()}>+ {t("addBrickType")}</Button>
    </form>
  );
}
