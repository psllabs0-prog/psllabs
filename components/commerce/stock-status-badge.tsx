import { STOCK_STATUS_LABELS, type StockStatus } from "@/lib/products/stock";
import { cn } from "@/lib/utils";

const statusStyles: Record<
  StockStatus,
  { pill: string; dot: string; text: string }
> = {
  in_stock: {
    pill: "border-accent/35 bg-accent/10",
    dot: "bg-accent",
    text: "text-accent",
  },
  low_stock: {
    pill: "border-signal/40 bg-signal/10",
    dot: "bg-signal",
    text: "text-signal",
  },
  out_of_stock: {
    pill: "border-border-strong bg-surface",
    dot: "bg-stone",
    text: "text-ash",
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
        "inline-flex w-fit items-center gap-2 rounded-pill border px-3 py-1 font-mono text-[0.65rem] uppercase tracking-wider",
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
