import { BUSINESS } from "@/lib/business";

/** Letterhead for invoices and bills: logo, business name, owner and phone numbers. */
export function BillHeader({ title, right }: { title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-primary pb-3">
      <div className="flex items-center gap-3">
        <img src={BUSINESS.logo} alt={BUSINESS.name} width={72} height={72} className="h-[72px] w-[72px] rounded-md object-contain" />
        <div>
          <div className="text-2xl font-bold leading-tight text-primary">{BUSINESS.name}</div>
          <div className="text-sm font-semibold">{BUSINESS.owner}</div>
          <div className="num text-sm">{BUSINESS.phones.join(" · ")}</div>
          <div className="mt-1 text-lg font-semibold">{title}</div>
        </div>
      </div>
      {right && <div className="text-end">{right}</div>}
    </header>
  );
}

export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return <img src={BUSINESS.logo} alt="" width={size} height={size} className={`shrink-0 rounded object-contain ${className}`} style={{ width: size, height: size }} />;
}
