import { formatPrice } from "@/lib/cart/format";
import { getProductPricing } from "@/lib/products/pricing";
import { cn } from "@/lib/utils";
import styles from "./product-price.module.css";

/** Current catalog/cart prices. Receipts must display their stored order amounts. */
export function ProductPrice({
  handle,
  unitPrice,
  quantity = 1,
  size = "card",
  stacked = false,
  className,
}: {
  handle: string;
  unitPrice?: number;
  quantity?: number;
  size?: "card" | "large" | "compact";
  stacked?: boolean;
  className?: string;
}) {
  const pricing = getProductPricing(handle);
  const actualUnitPrice = unitPrice ?? (pricing ? pricing.salePriceCents / 100 : undefined);
  if (actualUnitPrice === undefined) return null;
  const cents = Math.round(actualUnitPrice * 100);
  const showRegular = pricing && cents === pricing.salePriceCents;

  return (
    <span data-product-price={handle} data-current-unit-price-cents={cents} data-price-quantity={quantity}
      className={cn(styles.priceGroup, styles[size], stacked && styles.stacked, className)}>
      {showRegular && <del className={styles.regular}><span className="sr-only">Regular price: </span>{formatPrice(pricing.compareAtPriceCents * quantity / 100)}</del>}
      <span className={styles.sale}><span className="sr-only">{showRegular ? "Sale price: " : "Price: "}</span>{formatPrice(cents * quantity / 100)}</span>
    </span>
  );
}

export function SaleBadge({ handle, className }: { handle: string; className?: string }) {
  const pricing = getProductPricing(handle);
  if (!pricing || pricing.savingsCents <= 0) return null;
  const saving = formatPrice(pricing.savingsCents / 100);
  return <span data-sale-badge={handle} className={cn(styles.badge, className)} aria-label={`${saving} off regular price`}>{saving} OFF</span>;
}
