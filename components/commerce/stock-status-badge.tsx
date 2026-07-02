import { STOCK_STATUS_LABELS, type StockStatus } from "@/lib/products/stock";
import { cn } from "@/lib/utils";

const statusStyles: Record<
  StockStatus,
  { pill: string; dot: string; text: string }
> = {
  in_stock: {
    pill: "border-emerald-200/80 bg-emerald-50/80",
    dot: "bg-emerald-500",
    text: "text-emerald-800",
  },
  low_stock: {
    pill: "border-amber-200/80 bg-amber-50/80",
    dot: "bg-amber-500",
    text: "text-amber-800",
  },
  out_of_stock: {
    pill: "border-red-200/80 bg-red-50/80",
    dot: "bg-signal",
    text: "text-signal",
  },
};

type StockStatusBadgeProps = {
  status: StockStatus;
  className?: string;
};

export function StockStatusBadge({ status, className }: StockStatusBadgeProps) {
  const styles = statusStyles[status];

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-pill border px-3 py-1 font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider",
        styles.pill,
        styles.text,
        className
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", styles.dot)}
      />
      {STOCK_STATUS_LABELS[status]}
    </span>
  );
}
