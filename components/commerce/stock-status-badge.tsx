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
  const isOut = status === "out_of_stock" || (available !== undefined && available <= 0);
  return (
    <span
      data-stock-status={isOut ? "out_of_stock" : "in_stock"}
      className={cn(
        "inline-flex w-fit items-center text-xs font-medium text-ash",
        className
      )}
    >
      {isOut ? "Out of stock" : "In stock"}
    </span>
  );
}
