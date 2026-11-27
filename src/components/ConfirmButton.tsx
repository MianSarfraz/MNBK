"use client";

import type { ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export function ConfirmButton({ children, onConfirm, description, confirmLabel, variant = "default", size = "default", disabled, id, className, title }: {
  children: ReactNode; onConfirm: () => void; description?: string; confirmLabel?: string; id?: string; className?: string; title?: string;
  variant?: "default" | "destructive" | "outline" | "secondary"; size?: "default" | "sm" | "lg"; disabled?: boolean;
}) {
  const { t } = useT();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button id={id} title={title} aria-label={title} className={className} variant={variant} size={size} disabled={disabled}>{children}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmAction")}</AlertDialogTitle>
          <AlertDialogDescription>{description ?? t("balanceChange")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className={confirmLabel ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}>{confirmLabel ?? t("save")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
