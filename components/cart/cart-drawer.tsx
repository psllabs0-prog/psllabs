"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { ProductAvailability } from "@/lib/inventory/availability";
import { cn } from "@/lib/utils";

function CartLineRow({
  line,
  maxAvailable,
  onDecrease,
  onIncrease,
  onRemove,
  onError,
}: {
  line: ReturnType<typeof useCart>["lines"][number];
  maxAvailable?: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onRemove: () => void;
  onError: (message: string | null) => void;
}) {
  const lineTotal = line.unitPrice * line.quantity;
  const atMax =
    maxAvailable !== undefined &&
    maxAvailable > 0 &&
    line.quantity >= maxAvailable;

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
            <p className="mt-1 font-mono text-sm text-ash">
              {formatPrice(line.unitPrice)} each
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-md p-1.5 text-ash transition-colors hover:bg-surface hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`Remove ${line.name} from cart`}
          >
            <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-md border border-linen bg-surface">
            <button
              type="button"
              onClick={() => {
                onError(null);
                onDecrease();
              }}
              className="flex size-9 items-center justify-center text-lg transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="Decrease quantity"
            >
              <Minus className="size-3.5" strokeWidth={2} aria-hidden />
            </button>
            <span className="min-w-10 border-x border-linen px-2 py-1.5 text-center font-mono text-sm">
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => {
                onError(null);
                onIncrease();
              }}
              disabled={atMax}
              className="flex size-9 items-center justify-center text-lg transition-opacity hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Increase quantity"
            >
              <Plus className="size-3.5" strokeWidth={2} aria-hidden />
            </button>
          </div>
          <p className="font-mono text-lg font-medium text-ink">
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
    items,
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

  const [availabilityMap, setAvailabilityMap] = useState<
    Map<string, ProductAvailability>
  >(new Map());
  const [cartError, setCartError] = useState<string | null>(null);

  const handlesKey = useMemo(
    () => items.map((item) => item.handle).sort().join(","),
    [items]
  );

  useEffect(() => {
    if (!isOpen || items.length === 0) return;

    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(
          `/api/inventory/availability?handles=${encodeURIComponent(handlesKey)}`
        );
        const data = (await res.json()) as {
          availability?: ProductAvailability[];
        };
        if (cancelled || !data.availability) return;
        setAvailabilityMap(
          new Map(data.availability.map((row) => [row.handle, row]))
        );
      } catch {
        if (!cancelled) setAvailabilityMap(new Map());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, handlesKey, items.length]);

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
        className="flex w-full flex-col border-linen bg-paper p-0 shadow-none sm:max-w-md"
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
                Browse Catalog
              </PillButton>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-5 py-2">
                {lines.map((line) => {
                  const availability = availabilityMap.get(line.handle);
                  const maxAvailable = availability?.tracked
                    ? availability.available
                    : undefined;

                  return (
                    <CartLineRow
                      key={line.handle}
                      line={line}
                      maxAvailable={maxAvailable}
                      onDecrease={() => {
                        if (line.quantity <= 1) {
                          removeItem(line.handle);
                          return;
                        }
                        setItemQuantity(line.handle, line.quantity - 1, maxAvailable);
                      }}
                      onIncrease={() => {
                        const result = setItemQuantity(
                          line.handle,
                          line.quantity + 1,
                          maxAvailable
                        );
                        if (!result.ok) setCartError(result.error);
                      }}
                      onRemove={() => removeItem(line.handle)}
                      onError={setCartError}
                    />
                  );
                })}
              </div>

              <div className="border-t border-linen bg-surface px-5 py-5">
                {cartError && (
                  <p role="alert" className="mb-3 text-sm text-signal">
                    {cartError}
                  </p>
                )}
                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between text-ash">
                    <dt>Subtotal</dt>
                    <dd className="font-mono font-medium text-ink">
                      {formatPrice(subtotal)}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-4 text-ash">
                    <dt>Shipping</dt>
                    <dd
                      className={cn(
                        "max-w-[14rem] text-right font-mono text-xs leading-relaxed md:text-sm",
                        shippingDisplay.isFreeShipping &&
                          "font-medium text-accent"
                      )}
                    >
                      {shippingDisplay.message}
                    </dd>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-linen pt-3">
                    <dt className="text-base font-medium text-ink">
                      Estimated total
                    </dt>
                    <dd className="font-mono text-xl font-medium text-ink">
                      {formatPrice(estimatedTotal)}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  onClick={handleProceedToCheckout}
                  className="mt-5 inline-flex w-full items-center justify-center rounded-pill bg-accent px-6 py-4 text-base font-medium text-page transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
