"use client";

import { ShoppingBag } from "lucide-react";

import { useCart } from "@/components/cart/cart-provider";
import { cn } from "@/lib/utils";

type CartIconButtonProps = {
  className?: string;
};

export function CartIconButton({ className }: CartIconButtonProps) {
  const { totalQuantity, openCart, isHydrated } = useCart();

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={
        totalQuantity > 0
          ? `Open cart, ${totalQuantity} items`
          : "Open cart"
      }
      className={cn(
        "relative inline-flex size-11 items-center justify-center rounded-lg text-ink transition-colors duration-200 ease-out hover:bg-soft-blue/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue",
        className
      )}
    >
      <ShoppingBag className="size-6" strokeWidth={1.35} aria-hidden />
      {isHydrated && totalQuantity > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-primary-blue font-[family-name:var(--font-mono)] text-[0.625rem] font-medium text-lab-white">
          {totalQuantity > 99 ? "99+" : totalQuantity}
        </span>
      )}
    </button>
  );
}
