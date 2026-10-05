import Link from "next/link";
import { Truck } from "lucide-react";

import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";

export function AnnouncementBar() {
  return (
    <aside aria-label="Shipping information">
      <Link
        href="/shipping"
        className="group relative block w-full overflow-hidden border-b border-linen bg-surface transition-colors duration-200 ease-out hover:bg-border-strong/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        aria-label={`$${FLAT_SHIPPING_USD} U.S. shipping. Free on product subtotals of $${FREE_SHIPPING_THRESHOLD} or more. View shipping details.`}
      >
        <div className="relative mx-auto flex min-h-[44px] max-w-[1440px] items-center justify-center gap-2.5 px-4 py-2.5 md:min-h-[48px] md:gap-3 md:px-6 md:py-3 lg:px-24">
          <Truck
            className="hidden size-4 shrink-0 text-accent sm:block"
            strokeWidth={1.75}
            aria-hidden
          />

          <p className="text-center font-[family-name:var(--font-sans)] text-[0.8125rem] font-medium leading-snug tracking-[-0.01em] text-ink md:text-sm">
            <span className="sm:hidden">
              ${FLAT_SHIPPING_USD} U.S. shipping · Free at ${FREE_SHIPPING_THRESHOLD}+
            </span>
            <span className="hidden sm:inline">
              ${FLAT_SHIPPING_USD} U.S. shipping · Free on product subtotals of $
              {FREE_SHIPPING_THRESHOLD} or more
            </span>
          </p>
        </div>
      </Link>
    </aside>
  );
}
