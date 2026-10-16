"use client";

import { useState } from "react";
import type { OrderShippingAddress } from "@/lib/orders/types";
import { getOrderShippingPresentation } from "@/lib/shipping/presentation";
import { labelRateMatchesShippingSelection } from "@/lib/btcpostage/shipping-guard";

type Shipping = OrderShippingAddress;

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
  const [purchaseUncertain, setPurchaseUncertain] = useState(false);

  const quotedPackage = shipping.selection?.package;
  const [weightLbs, setWeightLbs] = useState("0");
  const [weightOz, setWeightOz] = useState(String(quotedPackage?.weightOz ?? 4));
  const [heightIn, setHeightIn] = useState(String(quotedPackage?.heightIn ?? 3));
  const [widthIn, setWidthIn] = useState(String(quotedPackage?.widthIn ?? 4));
  const [depthIn, setDepthIn] = useState(String(quotedPackage?.lengthIn ?? 6));
  const shippingInfo = getOrderShippingPresentation(shipping);

  function invalidateRates() {
    setRates([]);
    setSelected("");
  }

  function packageBody() {
    return {
      weightLbs: Number(weightLbs),
      weightOz: Number(weightOz),
      heightIn: Number(heightIn),
      widthIn: Number(widthIn),
      depthIn: Number(depthIn),
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
    if (next?.purchaseStatus === "purchased" || next?.purchaseStatus === "failed") setPurchaseUncertain(false);
    onLabelChange?.(next);
  }

  async function refreshSavedStatus() {
    const data = await post("status");
    applyLabel((data.label as LabelPublic) ?? null);
  }

  async function reviewPurchaseFailure(problem: unknown, fallback: string) {
    const message = problem instanceof Error ? problem.message : fallback;
    setPurchaseUncertain(true);
    try {
      await refreshSavedStatus();
      setError(message);
    } catch {
      setError(`${message} Saved status could not be refreshed. Do not buy again; check status or retrieve the existing purchase.`);
    }
  }

  async function onStatus() {
    try { await refreshSavedStatus(); }
    catch { setError("Saved status could not be refreshed. Do not buy another label until the existing purchase is checked."); }
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
      const pkg = packageBody();
      if (![pkg.weightLbs, pkg.weightOz].every((n) => Number.isFinite(n) && n >= 0) ||
          pkg.weightLbs * 16 + pkg.weightOz <= 0 ||
          ![pkg.depthIn, pkg.widthIn, pkg.heightIn].every((n) => Number.isFinite(n) && n > 0)) {
        setError("Enter the measured package weight and dimensions before requesting rates.");
        return;
      }
      const data = await post("get_rates", packageBody());
      const nextRates = (Array.isArray(data.rates) ? (data.rates as Rate[]) : [])
        .filter((rate) => rate.currency.trim().toUpperCase() === "USD" &&
          Number.isFinite(Number(rate.rate)) && Number(rate.rate) > 0 &&
          labelRateMatchesShippingSelection(shipping.selection, rate));
      setRates(nextRates);
      setSelected(shipping.selection && nextRates[0]
        ? `${nextRates[0].carrier}::${nextRates[0].service}` : "");
      if (nextRates.length === 0) setError(shipping.selection
        ? "No rate matches the order's selected shipping service. Review before buying a label."
        : "No rates returned.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rates failed");
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
      await reviewPurchaseFailure(e, "Retrieve failed");
    }
  }

  const destination = `${shipping.firstName} ${shipping.lastName}\n${shipping.address}\n${shipping.city}, ${shipping.state} ${shipping.zip}\n${shipping.country}`;

  return (
    <div className="mt-3 border-t border-black/10 pt-3 text-sm">
      <p className="font-medium text-ink">BTCPostage label</p>
      <p className="mt-1 font-medium text-ink">Order service: {shippingInfo.serviceName}</p>
      {!shippingInfo.legacy && <p className="mt-1 text-xs text-ash">Only rates matching the saved carrier and service are available. A label purchase still requires your confirmation.</p>}
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
            disabled={busy !== null}
            value={weightLbs}
            onChange={(e) => { setWeightLbs(e.target.value); invalidateRates(); }}
          />
        </label>
        <label className="text-xs text-ash">
          Oz
          <input
            className="mt-1 w-full border px-2 py-1"
            disabled={busy !== null}
            value={weightOz}
            onChange={(e) => { setWeightOz(e.target.value); invalidateRates(); }}
          />
        </label>
        <label className="text-xs text-ash">
          H (in)
          <input
            className="mt-1 w-full border px-2 py-1"
            disabled={busy !== null}
            value={heightIn}
            onChange={(e) => { setHeightIn(e.target.value); invalidateRates(); }}
          />
        </label>
        <label className="text-xs text-ash">
          W (in)
          <input
            className="mt-1 w-full border px-2 py-1"
            disabled={busy !== null}
            value={widthIn}
            onChange={(e) => { setWidthIn(e.target.value); invalidateRates(); }}
          />
        </label>
        <label className="text-xs text-ash">
          D (in)
          <input
            className="mt-1 w-full border px-2 py-1"
            disabled={busy !== null}
            value={depthIn}
            onChange={(e) => { setDepthIn(e.target.value); invalidateRates(); }}
          />
        </label>
      </div>
      <p className="mt-1 text-xs text-ash">
        Confirm the packed weight and outside dimensions. {quotedPackage ? "Priority orders start with their saved quoted package; changes require review." : "The default package is 6 × 4 × 3 in (depth × width × height)."}
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
        {(purchaseUncertain || label?.purchaseStatus === "needs_review" ||
          label?.purchaseStatus === "purchasing" ||
          (label?.purchaseStatus === "purchased" && (!label.trackingNumber?.trim() || !label.labelUrl?.trim()))) && (
          <button
            type="button"
            disabled={busy !== null || !configured}
            className="underline disabled:opacity-50"
            onClick={() => void onRetrieve()}
          >
            Retrieve purchase
          </button>
        )}
        {(purchaseUncertain || label?.purchaseStatus === "needs_review" || label?.purchaseStatus === "purchasing") && (
          <button type="button" disabled={busy !== null || !configured} className="min-h-11 underline disabled:opacity-50" onClick={() => void onStatus()}>
            Refresh saved status
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
            Print manually from the browser (MUNBYN). A label does not confirm
            carrier pickup. Review tracking status above and confirm the
            actual carrier handoff on the ledger.
          </p>
          {label.isRealShipment && (
            <a href="/admin-ledger" className="underline">
              Confirm carrier handoff on ledger
            </a>
          )}
        </div>
      )}

      {(purchaseUncertain || label?.purchaseStatus === "needs_review" || label?.purchaseStatus === "purchasing") && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-800" role="status">
          <p className="font-medium">Purchase needs review — do not buy another label.</p>
          {label?.btcpOrderId ? <p className="mt-1 break-all">Recorded BTCPostage purchase: <span className="font-mono">{label.btcpOrderId}</span></p> : <p className="mt-1">The saved provider purchase ID is not available yet.</p>}
          <p className="mt-1 text-xs">Status checks and retrieval do not buy a new label or send an email.</p>
          {label?.lastError ? <p className="mt-2 break-words text-sm">{label.lastError}</p> : null}
        </div>
      )}
      {label?.lastError && label.purchaseStatus === "failed" && (
        <p className="mt-2 text-red-700">{label.lastError}</p>
      )}
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
