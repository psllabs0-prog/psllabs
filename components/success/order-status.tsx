"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { PublicOrder } from "@/lib/orders/types";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function shippingLabel(n: number): string {
  return n > 0 ? money(n) : "Free";
}

type Banner = { title: string; tone: string; body: string };

function bannerFor(status: PublicOrder["status"] | "pending"): Banner {
  switch (status) {
    case "paid":
      return {
        title: "Payment confirmed",
        tone: "text-verified-green",
        body: "Thank you. We've received your payment and notified our team to begin fulfillment.",
      };
    case "cancelled":
      return {
        title: "Order cancelled",
        tone: "text-ash",
        body: "This invoice expired before payment was completed. You can place a new order anytime.",
      };
    case "failed":
      return {
        title: "Payment problem",
        tone: "text-signal",
        body: "This payment was marked invalid. If you believe this is an error, contact support@psllabs.org.",
      };
    default:
      return {
        title: "Payment received — confirming on the network",
        tone: "text-primary-blue",
        body: "Bitcoin confirmations can take a few minutes. This page updates automatically — no need to refresh.",
      };
  }
}

export function OrderStatus({
  orderId,
  initialOrder,
}: {
  orderId: string;
  initialOrder: PublicOrder | null;
}) {
  const [order, setOrder] = useState<PublicOrder | null>(initialOrder);
  const [notFound, setNotFound] = useState(false);

  const status = order?.status ?? "pending";
  const isTerminal =
    status === "paid" || status === "cancelled" || status === "failed";

  useEffect(() => {
    if (order && isTerminal) return;

    let active = true;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/order-status?orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" }
        );
        if (res.status === 404) {
          if (active) setNotFound(true);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { order?: PublicOrder };
        if (active && data.order) {
          setOrder(data.order);
          setNotFound(false);
        }
      } catch {
        /* transient — keep polling */
      }
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [orderId, isTerminal, order]);

  const banner = bannerFor(status);

  return (
    <div className="mx-auto max-w-[720px] px-6 py-16 md:px-12 lg:py-20">
      <p className="mono text-ash">ORDER {orderId}</p>
      <h1
        className={`mt-3 font-display text-display-md font-bold ${banner.tone}`}
      >
        {banner.title}
      </h1>
      <p className="mt-3 text-ash">{banner.body}</p>

      {notFound && !order && (
        <p className="mt-6 rounded-lg border border-linen bg-soft-blue/40 px-4 py-3 text-sm text-ash">
          We couldn&apos;t find that order yet. If you just paid, wait a moment
          and refresh, or contact support@psllabs.org.
        </p>
      )}

      {order && (
        <div className="premium-card mt-8 p-5 md:p-6">
          <h2 className="font-display text-lg font-bold text-ink">
            Order summary
          </h2>
          <ul className="mt-4 flex flex-col gap-3 border-b border-linen pb-4">
            {order.items.map((item) => (
              <li
                key={item.handle}
                className="flex justify-between gap-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium text-ink">{item.name}</span>
                  <span className="block text-xs text-ash">
                    {item.strength ? `${item.strength} · ` : ""}Qty{" "}
                    {item.quantity}
                  </span>
                </span>
                <span className="shrink-0 font-medium text-ink">
                  {money(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-ash">
              <dt>Subtotal</dt>
              <dd className="text-ink">{money(order.subtotal)}</dd>
            </div>
            {order.discountAmount > 0 && order.discountCode && (
              <div className="flex justify-between text-verified-green">
                <dt>Discount ({order.discountCode})</dt>
                <dd>-{money(order.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-ash">
              <dt>Shipping</dt>
              <dd className="text-ink">{shippingLabel(order.shippingCost)}</dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-linen pt-3">
              <dt className="font-display font-bold text-ink">Total</dt>
              <dd className="font-display text-lg font-bold text-ink">
                {money(order.total)}
              </dd>
            </div>
          </dl>
          <div className="mt-5 border-t border-linen pt-4 text-sm text-ash">
            <p className="font-medium text-ink">Shipping to</p>
            <p className="mt-1 whitespace-pre-line">
              {`${order.shipping.firstName} ${order.shipping.lastName}\n${order.shipping.address}\n${order.shipping.city}, ${order.shipping.state} ${order.shipping.zip}\n${order.shipping.country}`}
            </p>
          </div>
        </div>
      )}

      <div className="mt-10">
        <Link
          href="/"
          className="inline-flex rounded-pill bg-ink px-6 py-3.5 text-base font-medium text-lab-white transition-opacity hover:opacity-90"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
