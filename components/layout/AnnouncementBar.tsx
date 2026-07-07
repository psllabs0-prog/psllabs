import Link from "next/link";
import { Truck } from "lucide-react";

import { FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";

export function AnnouncementBar() {
  return (
    <Link
      href="/products"
      className="group relative block w-full overflow-hidden border-b border-white/10 bg-gradient-to-r from-[#0f172a] via-[#1e3a8a] to-[#2563eb] transition-[filter,box-shadow] duration-200 ease-out hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-accent"
      aria-label={`Free U.S. shipping on orders over $${FREE_SHIPPING_THRESHOLD}. Browse products.`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_120%_at_50%_-20%,rgba(56,189,248,0.22),transparent_60%)]"
      />

      <div className="relative mx-auto flex min-h-[44px] max-w-[1440px] items-center justify-center gap-2.5 px-4 py-2.5 md:min-h-[48px] md:gap-3 md:px-6 md:py-3 lg:px-24">
        <Truck
          className="hidden size-4 shrink-0 text-cyan-accent/90 sm:block"
          strokeWidth={1.75}
          aria-hidden
        />

        <p className="text-center font-[family-name:var(--font-sans)] text-[0.8125rem] font-medium leading-snug tracking-[-0.01em] text-white md:text-sm">
          <span className="sm:hidden">
            Free U.S. shipping over ${FREE_SHIPPING_THRESHOLD}
          </span>
          <span className="hidden sm:inline">
            Free U.S. shipping on orders over ${FREE_SHIPPING_THRESHOLD}
          </span>
          <span className="hidden text-white/75 md:inline">
            {" "}
            · Shipping calculated at checkout for orders under $
            {FREE_SHIPPING_THRESHOLD}.
          </span>
        </p>
      </div>
    </Link>
  );
}
