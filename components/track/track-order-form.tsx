"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import {
  displayStatusLabel,
  formatOrderDate,
  type TrackedOrder,
} from "@/lib/orders/tracking";
import type { TrackShipmentResult } from "@/lib/shippo";
import { cn } from "@/lib/utils";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

function shippingLabel(n: number): string {
  return n > 0 ? money(n) : "Free";
}

function statusTone(status: TrackedOrder["displayStatus"]): string {
  switch (status) {
    case "shipped":
      return "text-verified-green";
    case "paid":
      return "text-accent";
    case "pending":
      return "text-primary-blue";
    case "failed":
      return "text-signal";
    default:
      return "text-ash";
  }
}

function shipmentTone(status: TrackShipmentResult["status"]): string {
  switch (status) {
    case "delivered":
      return "text-verified-green";
    case "out_for_delivery":
      return "text-accent";
    case "in_transit":
      return "text-primary-blue";
    case "label_created":
      return "text-ash";
    default:
      return "text-ash";
  }
}

export function TrackOrderForm() {
  const [email, setEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [shipment, setShipment] = useState<TrackShipmentResult | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotFound(false);
    setOrder(null);
    setShipment(null);

    const trimmedTracking = trackingNumber.trim();
    const trimmedEmail = email.trim();
    const trimmedOrderId = orderId.trim();

    if (!trimmedTracking && (!trimmedEmail || !trimmedOrderId)) {
      setError("Enter a tracking number, or both email and order number.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          orderId: trimmedOrderId,
          trackingNumber: trimmedTracking || undefined,
        }),
      });

      const data = (await res.json()) as {
        found?: boolean;
        mode?: "order" | "tracking";
        order?: TrackedOrder;
        shipment?: TrackShipmentResult;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error ?? "Unable to look up tracking. Please try again.");
        return;
      }

      if (data.mode === "tracking" && data.shipment) {
        setShipment(data.shipment);
        return;
      }

      if (!data.found || !data.order) {
        setNotFound(true);
        return;
      }

      setOrder(data.order);
      setShipment(data.shipment ?? null);
    } catch {
      setError("Unable to look up your order. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="premium-card flex flex-col gap-5 p-5 md:p-6"
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="track-tracking-number"
            className="text-sm font-medium text-ink"
          >
            Tracking number
          </label>
          <Input
            id="track-tracking-number"
            type="text"
            autoComplete="off"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="9400..."
            className="h-11 rounded-lg border-linen bg-lab-white px-3 font-mono placeholder:text-stone"
          />
        </div>

        <p className="text-center text-xs uppercase tracking-wider text-ash">
          or look up by order
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="track-email" className="text-sm font-medium text-ink">
            Email address
          </label>
          <Input
            id="track-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@institution.edu"
            className="h-11 rounded-lg border-linen bg-lab-white px-3 placeholder:text-stone"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="track-order-id" className="text-sm font-medium text-ink">
            Order number
          </label>
          <Input
            id="track-order-id"
            type="text"
            autoComplete="off"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="psl_..."
            className="h-11 rounded-lg border-linen bg-lab-white px-3 font-mono placeholder:text-stone"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-signal">
            {error}
          </p>
        )}

        {notFound && (
          <p
            role="status"
            className="rounded-lg border border-linen bg-soft-blue/40 px-4 py-3 text-sm text-ash"
          >
            No order found. Check your email and order number, or contact
            support@psllabs.org if you need help.
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Looking up…" : "Track shipment"}
        </button>
      </form>

      {shipment && !order && (
        <div className="premium-card p-5 md:p-6">
          <p className="mono text-xs text-ash">SHIPMENT STATUS</p>
          <p
            className={cn(
              "mt-2 font-display text-xl font-bold",
              shipmentTone(shipment.status)
            )}
          >
            {shipment.statusLabel}
          </p>
          <p className="mt-2 text-sm text-ash">{shipment.statusDetails}</p>
          <p className="mt-4 text-sm text-ink">
            Tracking:{" "}
            <span className="font-mono">{shipment.trackingNumber}</span>
          </p>
          {shipment.eta && (
            <p className="mt-1 text-sm text-ash">
              Estimated delivery:{" "}
              {new Intl.DateTimeFormat("en-US", {
                dateStyle: "medium",
              }).format(new Date(shipment.eta))}
            </p>
          )}
        </div>
      )}

      {order && (
        <div className="premium-card p-5 md:p-6">
          <div className="flex flex-col gap-2 border-b border-linen pb-4">
            <p className="mono text-xs text-ash">ORDER {order.orderId}</p>
            <p className="text-sm text-ash">
              Placed {formatOrderDate(order.createdAt)}
            </p>
            <p
              className={cn(
                "font-display text-xl font-bold",
                statusTone(order.displayStatus)
              )}
            >
              {displayStatusLabel(order.displayStatus)}
            </p>
            {order.trackingNumber && (
              <p className="text-sm text-ink">
                Tracking:{" "}
                <span className="font-mono">{order.trackingNumber}</span>
              </p>
            )}
            {shipment && (
              <div className="mt-2 rounded-lg border border-linen bg-surface px-4 py-3">
                <p className="text-xs uppercase tracking-wider text-ash">
                  Carrier status
                </p>
                <p
                  className={cn(
                    "mt-1 font-display text-lg font-bold",
                    shipmentTone(shipment.status)
                  )}
                >
                  {shipment.statusLabel}
                </p>
                <p className="mt-1 text-sm text-ash">{shipment.statusDetails}</p>
              </div>
            )}
          </div>

          <ul className="mt-4 flex flex-col gap-3 border-b border-linen pb-4">
            {order.items.map((item) => (
              <li
                key={item.handle}
                className="flex justify-between gap-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium text-ink">{item.name}</span>
                  <span className="mt-0.5 block font-mono text-xs text-ash">
                    {item.sku}
                    {item.strength ? ` · ${item.strength}` : ""} · Qty{" "}
                    {item.quantity}
                  </span>
                </span>
                <span className="shrink-0 font-mono font-medium text-ink">
                  {money(item.lineTotal)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-ash">
              <dt>Subtotal</dt>
              <dd className="font-mono text-ink">{money(order.subtotal)}</dd>
            </div>
            {order.discountAmount > 0 && order.discountCode && (
              <div className="flex justify-between text-accent">
                <dt>Discount ({order.discountCode})</dt>
                <dd className="font-mono">-{money(order.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-ash">
              <dt>Shipping</dt>
              <dd className="font-mono text-ink">
                {shippingLabel(order.shippingCost)}
              </dd>
            </div>
            <div className="mt-2 flex justify-between border-t border-linen pt-3">
              <dt className="font-medium text-ink">Total</dt>
              <dd className="font-mono text-lg font-medium text-ink">
                {money(order.total)}
              </dd>
            </div>
          </dl>

          <div className="mt-5 border-t border-linen pt-4 text-sm text-ash">
            <p className="font-medium text-ink">Shipping destination</p>
            <p className="mt-1 whitespace-pre-line">{order.shippingSummary}</p>
            <p className="mt-2 text-xs leading-relaxed">
              Street address is omitted for privacy. Contact support if you need
              delivery assistance.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
