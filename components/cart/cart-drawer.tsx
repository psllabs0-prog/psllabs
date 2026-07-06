"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";

import { useCart } from "@/components/cart/cart-provider";
import { PillButton } from "@/components/ui/pill-button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatPrice } from "@/lib/cart/format";
import { cn } from "@/lib/utils";

function CartLineRow({
  line,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  line: ReturnType<typeof useCart>["lines"][number];
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
}) {
  const lineTotal = line.unitPrice * line.quantity;

  return (
    <article className="flex gap-4 border-b border-linen py-4 last:border-b-0">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-linen bg-soft-blue/40">
        <Image
          src={line.imageSrc}
          alt={line.imageAlt}
          fill
          sizes="80px"
          className="object-contain p-2"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-ink">
              {line.name}
            </h3>
            <p className="mt-0.5 text-xs text-ash">{line.strength}</p>
            <p className="mt-1 text-sm text-ash">
              {formatPrice(line.unitPrice)} each
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-md p-1.5 text-ash transition-colors hover:bg-soft-blue hover:text-ink"
            aria-label={`Remove ${line.name} from cart`}
          >
            <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-lg border border-linen bg-lab-white">
            <button
              type="button"
              onClick={onDecrease}
              className="flex size-9 items-center justify-center text-lg transition-opacity hover:opacity-70"
              aria-label="Decrease quantity"
            >
              <Minus className="size-3.5" strokeWidth={2} aria-hidden />
            </button>
            <span className="min-w-10 border-x border-linen px-2 py-1.5 text-center font-[family-name:var(--font-mono)] text-sm">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={onIncrease}
              className="flex size-9 items-center justify-center text-lg transition-opacity hover:opacity-70"
              aria-label="Increase quantity"
            >
              <Plus className="size-3.5" strokeWidth={2} aria-hidden />
            </button>
          </div>
          <p className="font-display text-lg font-bold text-ink">
            {formatPrice(lineTotal)}
          </p>
        </div>
      </div>
    </article>
  );
}

export function CartDrawer() {
  const router = useRouter();
  const {
    lines,
    isOpen,
    closeCart,
    totalQuantity,
    subtotal,
    estimatedTotal,
    shippingDisplay,
    removeItem,
    setItemQuantity,
  } = useCart();

  const isEmpty = lines.length === 0;

  function handleProceedToCheckout() {
    closeCart();
    router.push("/checkout");
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closeCart();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton
        overlayClassName="bg-black/[0.03] backdrop-blur-none supports-backdrop-filter:backdrop-blur-none"
        className="flex w-full flex-col border-linen bg-paper p-0 shadow-[0_0_48px_rgba(37,99,235,0.12)] sm:max-w-md"
      >
        <SheetHeader className="border-b border-linen px-5 py-4 pr-14">
          <SheetTitle className="font-display text-xl font-bold text-ink">
            Cart{totalQuantity > 0 ? ` (${totalQuantity})` : ""}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col overflow-hidden">
          {isEmpty ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
              <p className="text-base text-ash">Your cart is empty.</p>
              <PillButton href="/products" onClick={closeCart}>
                Start Shopping
              </PillButton>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-2">
                {lines.map((line) => (
                  <CartLineRow
                    key={line.handle}
                    line={line}
                    onDecrease={() =>
                      setItemQuantity(line.handle, line.quantity - 1)
                    }
                    onIncrease={() =>
                      setItemQuantity(line.handle, line.quantity + 1)
                    }
                    onRemove={() => removeItem(line.handle)}
                  />
                ))}
              </div>

              <div className="border-t border-linen bg-lab-white px-5 py-5">
                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between text-ash">
                    <dt>Subtotal</dt>
                    <dd className="font-medium text-ink">
                      {formatPrice(subtotal)}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 text-ash">
                    <dt>Shipping</dt>
                    <dd
                      className={cn(
                        "max-w-[14rem] text-right text-xs leading-relaxed md:text-sm",
                        shippingDisplay.isFreeShipping &&
                          "font-medium text-verified-green"
                      )}
                    >
                      {shippingDisplay.message}
                    </dd>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-linen pt-3">
                    <dt className="font-display text-base font-bold text-ink">
                      Estimated total
                    </dt>
                    <dd className="font-display text-xl font-bold text-ink">
                      {formatPrice(estimatedTotal)}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={handleProceedToCheckout}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-pill bg-ink px-6 py-4 text-base font-medium text-lab-white transition-opacity hover:opacity-90"
                >
                  Proceed to Checkout
                </button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
