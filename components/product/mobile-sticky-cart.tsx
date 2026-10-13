"use client";

import { AddToCartButton } from "@/components/commerce/AddToCartButton";
import { formatPrice } from "@/lib/cart/format";
import type { ProductAvailability } from "@/lib/inventory/availability";
import type { StockStatus } from "@/lib/products/stock";
import { cn } from "@/lib/utils";

import { useProductQuantity } from "./product-quantity-provider";
import styles from "./product-details.module.css";

type MobileStickyCartProps = {
  productHandle: string;
  productName: string;
  stockStatus: StockStatus;
  availability?: ProductAvailability;
};

export function MobileStickyCart({
  productHandle,
  productName,
  stockStatus,
  availability,
}: MobileStickyCartProps) {
  const { quantity, totalPrice } = useProductQuantity();
  const maxAvailable = availability?.tracked ? availability.available : undefined;
  const isOutOfStock =
    stockStatus === "out_of_stock" || (maxAvailable !== undefined && maxAvailable <= 0);

  return (
    <div className={styles.mobileSticky}>
      <div className={styles.stickyInner}>
        <div className="min-w-0">
          <p className={styles.stickyName}>{productName}</p>
          <p className={styles.stickyPrice}>
            {formatPrice(totalPrice)}
          </p>
        </div>
        <AddToCartButton
          productId={productHandle}
          quantity={quantity}
          maxAvailable={maxAvailable}
          variant="compact"
          disabled={isOutOfStock}
          className={cn(styles.stickyButton, isOutOfStock && "opacity-60")}
        >
          {isOutOfStock ? "Out of Stock" : "Add to Cart"}
        </AddToCartButton>
      </div>
    </div>
  );
}
