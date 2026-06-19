"use client";

import { AddToCartButton } from "@/components/commerce/AddToCartButton";

type MobileStickyCartProps = {
  productHandle: string;
  price: number;
  productName: string;
};

export function MobileStickyCart({
  productHandle,
  price,
  productName,
}: MobileStickyCartProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-sage)] bg-[var(--color-lab-white)] px-6 py-4 lg:hidden">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--color-stone)]">
            {productName}
          </p>
          <p className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">
            ${price}
          </p>
        </div>
        <AddToCartButton
          productId={productHandle}
          variant="compact"
        >
          Pay with Crypto
        </AddToCartButton>
      </div>
    </div>
  );
}
