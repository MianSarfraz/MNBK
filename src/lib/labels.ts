import type { Tables } from "@/integrations/supabase/types";
import type { Key } from "@/lib/i18n";

type Txn = Tables<"transactions">;

/** Neutral label for any transaction in the central khatta. */
export function txnKindLabel(x: Pick<Txn, "kind" | "direction">): Key {
  switch (x.kind) {
    case "kharcha": return "kharcha";
    case "expense": return "expense";
    case "salary": return "salaryPaid";
    case "worker_payment_us": return "payHim";
    case "worker_payment_them": return "hePays";
    case "sale_receipt": return x.direction === "in" ? "paymentReceived" : "refund";
    case "adjustment": return "adjustment";
    case "owner_transfer": return "ownerTransfer";
    default: return x.direction === "in" ? "otherIncome" : "otherExpense";
  }
}
