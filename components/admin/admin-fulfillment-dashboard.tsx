"use client";

import { useCallback, useEffect, useState } from "react";

import { BtcpostageOrderPanel } from "@/components/admin/btcpostage-order-panel";

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
  shipping: {
    firstName: string;
    lastName: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  workflowStatus: string;
  holdReason: string | null;
  blocker: string | null;
};

type LabelPublic = {
  pslOrderId: string;
  purchaseStatus: string;
  btcpOrderId: string | null;
  shipmentId: string | null;
  carrier: string | null;
  service: string | null;
  postageCost: number | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  testMode: boolean;
  purchasedAt: string | null;
  lastError: string | null;
  isRealShipment: boolean;
};

type Payload = {
  summary: {
    readyOrders: number;
    unitsToPick: number;
    holds: number;
    packedWaitingTracking: number;
  };
  pickList: Array<{ label: string; quantity: number }>;
  ready: Card[];
  hold: Card[];
  packed: Card[];
  btcpostage?: { configured: boolean; testMode: boolean };
  labelsByOrderId?: Record<string, LabelPublic>;
};

export function AdminFulfillmentDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [labelsByOrderId, setLabelsByOrderId] = useState<
    Record<string, LabelPublic>
  >({});

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/fulfillment");
    if (!res.ok) {
      setError("Failed to load fulfillment board.");
      return;
    }
    const payload = (await res.json()) as Payload;
    setData(payload);
    setLabelsByOrderId(payload.labelsByOrderId ?? {});
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(action: string, orderId: string, reason?: string) {
    setBusy(`${action}:${orderId}`);
    try {
      await fetch("/api/admin/fulfillment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, orderId, reason }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  function OrderCard({
    card,
    mode,
  }: {
    card: Card;
    mode: "ready" | "hold" | "packed";
  }) {
    return (
      <li className="premium-card px-4 py-3 text-sm">
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
          {mode === "packed" && (
            <a href="/admin-ledger" className="underline">
              Add tracking
            </a>
          )}
        </div>

        {(mode === "ready" || mode === "packed") && data && (
          <BtcpostageOrderPanel
            orderId={card.orderId}
            shipping={card.shipping}
            testMode={Boolean(data.btcpostage?.testMode)}
            configured={Boolean(data.btcpostage?.configured)}
            initialLabel={labelsByOrderId[card.orderId] ?? null}
            onLabelChange={(next) => {
              setLabelsByOrderId((prev) => {
                const copy = { ...prev };
                if (!next) delete copy[card.orderId];
                else copy[card.orderId] = next;
                return copy;
              });
            }}
          />
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
          What Luke needs to pack, hold, or review. Buy labels here; confirm
          tracking on the ledger (does not auto-mark shipped).
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
                  <OrderCard key={c.orderId} card={c} mode="ready" />
                ))
              )}
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
                  <OrderCard key={c.orderId} card={c} mode="hold" />
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
                  <OrderCard key={c.orderId} card={c} mode="packed" />
                ))
              )}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
