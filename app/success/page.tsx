import type { Metadata } from "next";
import Link from "next/link";

import { OrderStatus } from "@/components/success/order-status";
import { getOrder } from "@/lib/orders/store";
import { toPublicOrder, type PublicOrder } from "@/lib/orders/types";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Order Status",
  description: "Track the status of your PSL Labs order.",
  path: "/success",
});

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;

  if (!orderId) {
    return (
      <main className="section-surface-ice min-h-[60vh]">
        <div className="mx-auto max-w-[720px] px-6 py-24 text-center md:px-12">
          <p className="mono text-ash">ORDER CONFIRMED</p>
          <h1 className="mt-4 font-display text-display-md font-bold text-ink">
            Thank you
          </h1>
          <p className="mt-4 text-ash">
            If you just completed a payment, your confirmation link should
            include an order reference. Questions? Email support@psllabs.org.
          </p>
          <Link
            href="/"
            className="mt-8 inline-flex rounded-pill bg-ink px-6 py-3.5 text-base font-medium text-lab-white transition-opacity hover:opacity-90"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  let initialOrder: PublicOrder | null = null;
  try {
    const order = await getOrder(orderId);
    if (order) initialOrder = toPublicOrder(order);
  } catch (error) {
    console.error("[success] order lookup failed:", error);
  }

  return (
    <main className="section-surface-ice min-h-[60vh]">
      <OrderStatus orderId={orderId} initialOrder={initialOrder} />
    </main>
  );
}
