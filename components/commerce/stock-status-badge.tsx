import type { StockStatus } from "@/lib/products/stock";
import { cn } from "@/lib/utils";

type StockStatusBadgeProps = {
  status: StockStatus;
  available?: number;
  className?: string;
};

export function StockStatusBadge({
  status,
  available,
  className,
}: StockStatusBadgeProps) {
  const count = available ?? 0;
  const isOut = status === "out_of_stock" || count <= 0;
  const isLow = !isOut && status === "low_stock";

  if (isOut) {
    return (
      <span
        className={cn(
          "inline-flex w-fit items-center gap-2 rounded-pill border border-signal/50 bg-signal/10 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-signal",
          className
        )}
      >
        Out of Stock
      </span>
    );
  }

  if (isLow) {
    return (
      <span
        className={cn(
          "inline-flex w-fit items-center gap-2 rounded-pill border border-signal/40 bg-signal/10 px-3 py-1 text-sm font-medium text-signal",
          className
        )}
      >
        ⚠️ Low Stock: Only {count} remaining for this batch
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-pill border border-accent/35 bg-accent/10 px-3 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-accent",
        className
      )}
    >
      ✓ In Stock
    </span>
  );
}
