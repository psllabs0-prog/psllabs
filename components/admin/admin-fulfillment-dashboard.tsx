"use client";

import { useCallback, useEffect, useState } from "react";

import { BtcpostageOrderPanel } from "@/components/admin/btcpostage-order-panel";
import { FulfillmentShippingPanel } from "@/components/admin/fulfillment-shipping-panel";
import type { BtcpostageLabelPublic } from "@/lib/btcpostage/types";
import type { OrderShippingAddress } from "@/lib/orders/types";
import { getOrderShippingPresentation } from "@/lib/shipping/presentation";

type Card = {
  orderId: string;
  paidAt: string | null;
  paymentMethod: string | null;
  customerName: string;
  items: Array<{
    name: string;
    strength: string;
    sku: string | null;
    quantity: number;
  }>;
  shipping: OrderShippingAddress;
  workflowStatus: string;
  holdReason: string | null;
  blocker: string | null;
};

type Payload = {
  summary: {
    readyOrders: number;
    unitsToPick: number;
    holds: number;
    packedWaitingTracking: number;
    labelsReady?: number;
  };
  pickList: Array<{ label: string; quantity: number }>;
  ready: Card[];
  hold: Card[];
  packed: Card[];
  labeled?: Card[];
  btcpostage?: { configured: boolean; testMode: boolean };
  labelsByOrderId?: Record<string, BtcpostageLabelPublic>;
};

async function loadFulfillmentBoard(signal?: AbortSignal): Promise<Payload> {
  const response = await fetch("/api/admin/fulfillment", { signal });
  if (!response.ok) throw new Error("Failed to load fulfillment board.");
  return response.json() as Promise<Payload>;
}

export function AdminFulfillmentDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [labelsByOrderId, setLabelsByOrderId] = useState<
    Record<string, BtcpostageLabelPublic>
  >({});

  const refresh = useCallback(async () => {
    try {
      const payload = await loadFulfillmentBoard();
      setError(null);
      setData(payload);
      setLabelsByOrderId(payload.labelsByOrderId ?? {});
    } catch {
      setError("Failed to load fulfillment board.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadFulfillmentBoard(controller.signal).then((payload) => {
      if (controller.signal.aborted) return;
      setData(payload);
      setLabelsByOrderId(payload.labelsByOrderId ?? {});
    }).catch(() => {
      if (!controller.signal.aborted) setError("Failed to load fulfillment board.");
    });
    return () => controller.abort();
  }, []);

  async function act(action: string, orderId: string, reason?: string) {
    setBusy(`${action}:${orderId}`);
    try {
      const response = await fetch("/api/admin/fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, orderId, reason }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error || "Unable to save the fulfillment update.");
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save the fulfillment update.");
    } finally {
      setBusy(null);
    }
  }

  function renderOrderCard(card: Card, mode: "ready" | "hold" | "packed" | "labeled") {
    const shipping = getOrderShippingPresentation(card.shipping);
    return (
      <li key={card.orderId} className="premium-card px-4 py-3 text-sm">
        <p className="font-medium text-ink">
          {card.orderId} · {card.workflowStatus}
        </p>
        <p className="text-ash">
          {card.customerName} · {card.shipping.city}, {card.shipping.state}{" "}
          {card.shipping.zip}
        </p>
        <p className="text-ash">
          Paid {card.paidAt ?? "—"} · {card.paymentMethod ?? "—"}
        </p>
        <p className="mt-2 font-medium text-ink">Selected service: {shipping.serviceName}</p>
        {shipping.deliveryEstimate && <p className="text-ash">{shipping.deliveryEstimate}</p>}
        <p className="text-ash">{shipping.processingNotice}</p>
        <ul className="mt-2 list-disc pl-5">
          {card.items.map((it) => (
            <li key={`${card.orderId}-${it.sku}-${it.name}`}>
              {it.name} {it.strength}
              {it.sku ? ` (${it.sku})` : ""} × {it.quantity}
            </li>
          ))}
        </ul>
        {(card.blocker || card.holdReason) && (
          <p className="mt-2 text-red-700">
            {card.blocker || card.holdReason}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          <a
            href={`/api/admin/fulfillment?packingSlip=${encodeURIComponent(card.orderId)}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Packing slip
          </a>
          {mode === "ready" && (
            <>
              <button
                type="button"
                disabled={busy !== null}
                className="underline disabled:opacity-50"
                onClick={() => void act("start_packing", card.orderId)}
              >
                Start packing
              </button>
              <button
                type="button"
                disabled={busy !== null}
                className="underline disabled:opacity-50"
                onClick={() => void act("mark_packed", card.orderId)}
              >
                Mark packed
              </button>
              <button
                type="button"
                disabled={busy !== null}
                className="underline disabled:opacity-50"
                onClick={() =>
                  void act("place_hold", card.orderId, "Manual hold")
                }
              >
                Place hold
              </button>
            </>
          )}
          {mode === "hold" && (
            <button
              type="button"
              disabled={busy !== null}
              className="underline disabled:opacity-50"
              onClick={() => void act("remove_hold", card.orderId)}
            >
              Remove manual hold
            </button>
          )}
          {mode === "labeled" && <a href="/admin-ledger" className="underline">Confirm carrier handoff on ledger</a>}
        </div>

        {(mode === "ready" || mode === "packed" || mode === "labeled") && data && (
          <>
            <FulfillmentShippingPanel
              key={`${card.orderId}:${labelsByOrderId[card.orderId]?.purchaseStatus ?? "none"}:${labelsByOrderId[card.orderId]?.trackingNumber ?? ""}:${labelsByOrderId[card.orderId]?.labelUrl ?? ""}`}
              orderId={card.orderId}
              onLabelChange={(next) => {
                setLabelsByOrderId((previous) => {
                  const copy = { ...previous };
                  if (next) copy[card.orderId] = next;
                  else delete copy[card.orderId];
                  return copy;
                });
                if (next?.purchaseStatus === "purchased") void refresh();
              }}
            />
            <details className="mt-3 rounded-lg border border-white/10 px-3 py-2">
              <summary className="cursor-pointer py-1.5 text-sm font-medium text-ash focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Manual label tools &amp; purchase recovery</summary>
              <p className="mt-2 text-xs leading-relaxed text-ash">Use these tools for an older order, a package correction or an uncertain provider purchase. Retrieve an existing purchase before trying to buy again.</p>
              <BtcpostageOrderPanel
                key={`${card.orderId}:${labelsByOrderId[card.orderId]?.purchaseStatus ?? "none"}:${labelsByOrderId[card.orderId]?.trackingNumber ?? ""}`}
                orderId={card.orderId}
                shipping={card.shipping}
                testMode={Boolean(data.btcpostage?.testMode)}
                configured={Boolean(data.btcpostage?.configured)}
                initialLabel={labelsByOrderId[card.orderId] ?? null}
                onLabelChange={(next) => {
                  setLabelsByOrderId((previous) => {
                    const copy = { ...previous };
                    if (next) copy[card.orderId] = next as BtcpostageLabelPublic;
                    else delete copy[card.orderId];
                    return copy;
                  });
                }}
              />
            </details>
          </>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-display-lg font-bold text-ink">
          Fulfillment
        </h1>
        <p className="mt-2 text-sm text-ash">
          Pack paid orders, purchase their selected shipping label, and save
          tracking with the customer notification in one place.
        </p>
        {data?.btcpostage?.testMode && (
          <p className="mt-2 text-sm font-medium text-amber-800">
            BTCPOSTAGE TEST MODE is on — USPS test labels only; not real
            shipments.
          </p>
        )}
      </header>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {!data ? (
        <p className="text-sm text-ash">Loading…</p>
      ) : (
        <>
          <section className="premium-card px-5 py-4 text-sm">
            <p>
              Ready to pack: {data.summary.readyOrders} · Units to pick:{" "}
              {data.summary.unitsToPick} · Holds: {data.summary.holds} · Packed
              waiting tracking: {data.summary.packedWaitingTracking}
              {data.summary.labelsReady !== undefined ? ` · Labels ready: ${data.summary.labelsReady}` : ""}
            </p>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-lg font-bold text-ink">
                Pick list (ready)
              </h2>
              <a
                href="#pick-print"
                className="text-sm underline"
                onClick={(e) => {
                  e.preventDefault();
                  window.print();
                }}
              >
                Printable view
              </a>
            </div>
            <ul id="pick-print" className="mt-3 space-y-1 text-sm">
              {data.pickList.length === 0 ? (
                <li className="text-ash">No ready units.</li>
              ) : (
                data.pickList.map((p) => (
                  <li key={p.label}>
                    {p.label} — {p.quantity}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink">
              Ready to pack
            </h2>
            <ul className="mt-3 space-y-3">
              {data.ready.length === 0 ? (
                <li className="text-sm text-ash">None.</li>
              ) : (
                data.ready.map((c) => (
                  renderOrderCard(c, "ready")
                ))
              )}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink">Labels ready / awaiting carrier handoff</h2>
            <p className="mt-1 text-sm text-ash">Review tracking and customer email status here. Mark the order shipped after the package is handed to the carrier.</p>
            <ul className="mt-3 space-y-3">
              {!data.labeled?.length ? <li className="text-sm text-ash">No labeled orders awaiting handoff.</li> : data.labeled.map((card) => renderOrderCard(card, "labeled"))}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink">
              Hold / review
            </h2>
            <ul className="mt-3 space-y-3">
              {data.hold.length === 0 ? (
                <li className="text-sm text-ash">None.</li>
              ) : (
                data.hold.map((c) => (
                  renderOrderCard(c, "hold")
                ))
              )}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold text-ink">
              Packed / waiting tracking
            </h2>
            <ul className="mt-3 space-y-3">
              {data.packed.length === 0 ? (
                <li className="text-sm text-ash">None.</li>
              ) : (
                data.packed.map((c) => (
                  renderOrderCard(c, "packed")
                ))
              )}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
