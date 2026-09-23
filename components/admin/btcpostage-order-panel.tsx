"use client";

import { useState } from "react";

type Shipping = {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

type Rate = {
  service: string;
  serviceDisplay: string;
  rate: string;
  carrier: string;
  estDeliveryDays: string | number | null;
  currency: string;
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

type Props = {
  orderId: string;
  shipping: Shipping;
  testMode: boolean;
  configured: boolean;
  initialLabel: LabelPublic | null;
  onLabelChange?: (label: LabelPublic | null) => void;
};

export function BtcpostageOrderPanel({
  orderId,
  shipping,
  testMode,
  configured,
  initialLabel,
  onLabelChange,
}: Props) {
  const [label, setLabel] = useState<LabelPublic | null>(initialLabel);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [standardized, setStandardized] = useState<string | null>(null);
  const [rates, setRates] = useState<Rate[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [weightLbs, setWeightLbs] = useState("0");
  const [weightOz, setWeightOz] = useState("4");
  const [heightIn, setHeightIn] = useState("3");
  const [widthIn, setWidthIn] = useState("4");
  const [depthIn, setDepthIn] = useState("6");

  function packageBody() {
    return {
      weightLbs: Number(weightLbs) || 0,
      weightOz: Number(weightOz) || 0,
      heightIn: Number(heightIn) || 3,
      widthIn: Number(widthIn) || 4,
      depthIn: Number(depthIn) || 6,
      packageType: "Parcel",
    };
  }

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/btcpostage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, orderId, ...extra }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok || data.ok === false) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Request failed"
        );
      }
      return data;
    } finally {
      setBusy(null);
    }
  }

  function applyLabel(next: LabelPublic | null) {
    setLabel(next);
    onLabelChange?.(next);
  }

  async function onVerify() {
    try {
      const data = await post("verify_address");
      const errs = Array.isArray(data.errors)
        ? (data.errors as string[])
        : [];
      const std = data.standardized as
        | {
            street1?: string;
            street2?: string;
            city?: string;
            state?: string;
            zip?: string;
            country?: string;
          }
        | null;
      if (std) {
        setStandardized(
          [
            std.street1,
            std.street2,
            `${std.city}, ${std.state} ${std.zip}`,
            std.country,
          ]
            .filter(Boolean)
            .join("\n")
        );
      } else {
        setStandardized(null);
      }
      setVerifyMsg(
        data.isValid
          ? "Address verified."
          : errs.length
            ? `Verification issues: ${errs.join("; ")}`
            : "Address could not be verified."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify failed");
    }
  }

  async function onRates() {
    try {
      const data = await post("get_rates", packageBody());
      const nextRates = Array.isArray(data.rates) ? (data.rates as Rate[]) : [];
      setRates(nextRates);
      setSelected("");
      if (nextRates.length === 0) setError("No rates returned.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rates failed");
    }
  }

  async function onBuy() {
    const rate = rates.find(
      (r) => `${r.carrier}::${r.service}` === selected
    );
    if (!rate) {
      setError("Select a rate first.");
      return;
    }
    const costNote = testMode
      ? "TEST MODE — no credits should be charged for USPS."
      : "This will consume BTCPostage credits.";
    const ok = window.confirm(
      `Buy ${rate.carrier} ${rate.serviceDisplay || rate.service} for $${rate.rate}?\n\n${costNote}`
    );
    if (!ok) return;

    try {
      const data = await post("buy_label", {
        ...packageBody(),
        carrier: rate.carrier,
        service: rate.service,
        confirmPurchase: true,
      });
      applyLabel((data.label as LabelPublic) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Buy label failed");
    }
  }

  async function onRetrieve() {
    const btcpOrderId =
      label?.btcpOrderId ||
      window.prompt("BTCPostage order ID (if known):") ||
      "";
    try {
      const data = await post("retrieve_purchase", {
        btcpOrderId: btcpOrderId || undefined,
      });
      applyLabel((data.label as LabelPublic) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retrieve failed");
    }
  }

  const destination = `${shipping.firstName} ${shipping.lastName}\n${shipping.address}\n${shipping.city}, ${shipping.state} ${shipping.zip}\n${shipping.country}`;

  return (
    <div className="mt-3 border-t border-black/10 pt-3 text-sm">
      <p className="font-medium text-ink">BTCPostage label</p>
      {testMode && (
        <p className="mt-1 font-medium text-amber-800">
          BTCPOSTAGE TEST MODE — labels are not real customer shipments.
        </p>
      )}
      {!configured && (
        <p className="mt-1 text-ash">
          BTCPostage API is not configured on the server.
        </p>
      )}

      <p className="mt-2 whitespace-pre-line text-ash">{destination}</p>

      {standardized && (
        <p className="mt-2 whitespace-pre-line text-ink">
          Standardized:{"\n"}
          {standardized}
        </p>
      )}
      {verifyMsg && <p className="mt-1 text-ash">{verifyMsg}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="text-xs text-ash">
          Lbs
          <input
            className="mt-1 w-full border px-2 py-1"
            value={weightLbs}
            onChange={(e) => setWeightLbs(e.target.value)}
          />
        </label>
        <label className="text-xs text-ash">
          Oz
          <input
            className="mt-1 w-full border px-2 py-1"
            value={weightOz}
            onChange={(e) => setWeightOz(e.target.value)}
          />
        </label>
        <label className="text-xs text-ash">
          H (in)
          <input
            className="mt-1 w-full border px-2 py-1"
            value={heightIn}
            onChange={(e) => setHeightIn(e.target.value)}
          />
        </label>
        <label className="text-xs text-ash">
          W (in)
          <input
            className="mt-1 w-full border px-2 py-1"
            value={widthIn}
            onChange={(e) => setWidthIn(e.target.value)}
          />
        </label>
        <label className="text-xs text-ash">
          D (in)
          <input
            className="mt-1 w-full border px-2 py-1"
            value={depthIn}
            onChange={(e) => setDepthIn(e.target.value)}
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-ash">
        Default package 6 × 4 × 3 in (depth × width × height).
      </p>

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy !== null || !configured}
          className="underline disabled:opacity-50"
          onClick={() => void onVerify()}
        >
          Verify Address
        </button>
        <button
          type="button"
          disabled={busy !== null || !configured}
          className="underline disabled:opacity-50"
          onClick={() => void onRates()}
        >
          Get Shipping Rates
        </button>
        <button
          type="button"
          disabled={busy !== null || !configured || !selected}
          className="underline disabled:opacity-50"
          onClick={() => void onBuy()}
        >
          Buy Label
        </button>
        {(label?.purchaseStatus === "needs_review" ||
          label?.purchaseStatus === "purchasing") && (
          <button
            type="button"
            disabled={busy !== null || !configured}
            className="underline disabled:opacity-50"
            onClick={() => void onRetrieve()}
          >
            Retrieve purchase
          </button>
        )}
      </div>

      {rates.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rates.map((r) => {
            const key = `${r.carrier}::${r.service}`;
            return (
              <li key={key}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name={`rate-${orderId}`}
                    checked={selected === key}
                    onChange={() => setSelected(key)}
                  />
                  <span>
                    {r.carrier} · {r.serviceDisplay || r.service} · $
                    {r.rate}
                    {r.estDeliveryDays != null
                      ? ` · ~${r.estDeliveryDays} days`
                      : ""}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {label?.purchaseStatus === "purchased" && (
        <div className="mt-3 space-y-1">
          {label.testMode && (
            <p className="font-medium text-amber-800">
              TEST label — do not treat as a real shipment.
            </p>
          )}
          <p>
            Tracking: {label.trackingNumber ?? "—"} · {label.carrier ?? "—"}{" "}
            {label.service ?? ""}
          </p>
          <p>
            BTCPostage order: {label.btcpOrderId ?? "—"} · postage $
            {label.postageCost ?? "—"}
          </p>
          {label.labelUrl && (
            <a
              href={label.labelUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block underline"
            >
              Open / Print 4×6 Label
            </a>
          )}
          <p className="text-xs text-ash">
            Print manually from the browser (MUNBYN). Order is not marked
            shipped until you save tracking on the ledger
            {label.isRealShipment
              ? " (tracking is prefilled from this label)."
              : "."}
          </p>
          {label.isRealShipment && (
            <a href="/admin-ledger" className="underline">
              Confirm tracking on ledger
            </a>
          )}
        </div>
      )}

      {label?.purchaseStatus === "needs_review" && (
        <p className="mt-2 text-red-700">
          Needs review — do not buy again.{" "}
          {label.lastError ? label.lastError : ""}
        </p>
      )}
      {label?.lastError && label.purchaseStatus === "failed" && (
        <p className="mt-2 text-red-700">{label.lastError}</p>
      )}
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
