"use client";

import type { ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export function ConfirmButton({ children, onConfirm, description, variant = "default", size = "default", disabled, id, className }: {
  children: ReactNode; onConfirm: () => void; description?: string; id?: string; className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary"; size?: "default" | "sm" | "lg"; disabled?: boolean;
}) {
  const { t } = useT();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button id={id} className={className} variant={variant} size={size} disabled={disabled}>{children}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirmAction")}</AlertDialogTitle>
          <AlertDialogDescription>{description ?? t("balanceChange")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t("save")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
