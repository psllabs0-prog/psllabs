"use client";

import Link from "next/link";

import { AddToCartButton } from "@/components/commerce/AddToCartButton";
import { StockStatusBadge } from "@/components/commerce/stock-status-badge";
import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import { formatPrice } from "@/lib/cart/format";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { StockStatus } from "@/lib/products/stock";
import { cn } from "@/lib/utils";

import { useProductQuantity } from "./product-quantity-provider";
import styles from "./product-details.module.css";

type ProductPurchaseProps = {
  productHandle: string;
  stockStatus: StockStatus;
  availability?: ProductAvailability;
  nominalStrength?: string;
  hideSinglePriceOnMobile?: boolean;
  className?: string;
};

const MAX_QUANTITY = 10;

export function ProductPurchase({ productHandle, stockStatus, availability, nominalStrength, hideSinglePriceOnMobile = false, className }: ProductPurchaseProps) {
  const { quantity, setQuantity, unitPrice, totalPrice } = useProductQuantity();
  const status = availability?.status ?? stockStatus;
  const available = availability?.available;
  const maxQuantity = available !== undefined
    ? Math.min(MAX_QUANTITY, Math.max(0, available))
    : MAX_QUANTITY;
  const isOutOfStock = status === "out_of_stock" || maxQuantity <= 0;

  return (
    <div data-product-purchase className={cn(styles.purchase, className)}>
      <div className={cn(styles.purchasePriceRow, hideSinglePriceOnMobile && quantity === 1 && styles.mobileDuplicatePrice)}>
        <div>
          <span className={styles.purchasePrice}>{formatPrice(totalPrice)}</span>
          <p className={styles.purchaseMeta}>{quantity > 1 ? `${quantity} vials · ${formatPrice(unitPrice)} each` : "Price per vial"}</p>
        </div>
        <span className={styles.purchaseMeta}>USD</span>
      </div>

      <div className={styles.purchaseFacts}>
        <StockStatusBadge status={status} available={availability?.available} />
        {nominalStrength ? <span className={styles.vialSize}>Vial size <strong>{nominalStrength}</strong></span> : null}
      </div>

      <div className={styles.buyRow}>
        <AddToCartButton productId={productHandle} quantity={quantity} maxAvailable={availability?.tracked ? maxQuantity : undefined} disabled={isOutOfStock} className={cn(styles.addButton, isOutOfStock && "opacity-60")}>
          {isOutOfStock ? "Out of Stock" : "Add to Cart"}
        </AddToCartButton>
        <div className={styles.quantityGroup}>
          <span className={styles.quantityLabel} id={`quantity-${productHandle}`}>Quantity</span>
          <div className={styles.quantity} role="group" aria-labelledby={`quantity-${productHandle}`}>
            <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={isOutOfStock} aria-label="Decrease quantity">−</button>
            <span aria-live="polite">{quantity}</span>
            <button type="button" onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))} disabled={isOutOfStock || quantity >= maxQuantity} aria-label="Increase quantity">+</button>
          </div>
        </div>
      </div>

      <div className={styles.shipping}>
        <p><strong>{formatPrice(FLAT_SHIPPING_USD)} shipping</strong>{" · Free on product subtotals of "}{formatPrice(FREE_SHIPPING_THRESHOLD)} or more.</p>
        <p>Usually ships within 1–2 business days after payment clears. Tracked delivery to U.S. physical addresses.</p>
        <Link href="/shipping">Shipping policy</Link>
      </div>
    </div>
  );
}
