import type { Metadata } from "next";

import { TrackOrderForm } from "@/components/track/track-order-form";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Track Order",
  description:
    "Look up your PSL Labs order status, line items, and tracking information with your email and order number.",
  path: "/track",
});

export default function TrackPage() {
  return (
    <main className="min-h-screen bg-paper px-6 py-12 md:px-16 md:py-16 lg:px-24 lg:py-20">
      <div className="mx-auto max-w-[640px]">
        <header className="mb-8 md:mb-10">
          <p className="mono text-ash">ORDER TRACKING</p>
          <h1 className="font-display text-display-lg font-bold text-ink">
            Track your order
          </h1>
          <p className="mt-3 text-sm text-ash md:text-base">
            Enter the email address used at checkout and your order number to
            view status and tracking details.
          </p>
        </header>

        <TrackOrderForm />
      </div>
    </main>
  );
}
