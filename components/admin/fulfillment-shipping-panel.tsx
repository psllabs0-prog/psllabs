"use client";

import { useEffect, useRef, useState } from "react";

import type { BtcpostageLabelPublic } from "@/lib/btcpostage/types";
import type { FulfillmentShippingPreview, FulfillmentShippingStatus, ShippingNotificationStatus } from "@/lib/fulfillment/shipping-flow-types";

type ShippingReply = Partial<FulfillmentShippingStatus> & {
  ok?: boolean;
  error?: string;
  preview?: FulfillmentShippingPreview;
  alreadyPurchased?: boolean;
};

type Props = {
  orderId: string;
  serviceName?: string;
  onLabelChange?: (label: BtcpostageLabelPublic | null) => void;
};

const primaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-page transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const secondaryButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

function usd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function notificationLabel(notification: ShippingNotificationStatus | null | undefined): string {
  switch (notification?.status) {
    case "sent": return "Email sent";
    case "pending": return "Email queued";
    case "sending": return "Email sending";
    case "needs_review": return "Email needs attention";
    default: return "Email not queued";
  }
}

async function readShippingResponse(response: Response): Promise<ShippingReply> {
  const data = await response.json() as ShippingReply;
  if (!response.ok || data.ok === false) {
    throw new Error(typeof data.error === "string" ? data.error : "Unable to update shipping. Check the saved status before trying again.");
  }
  return data;
}

export function FulfillmentShippingPanel({ orderId, serviceName, onLabelChange }: Props) {
  const [status, setStatus] = useState<FulfillmentShippingStatus | null>(null);
  const [preview, setPreview] = useState<FulfillmentShippingPreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [purchaseUncertain, setPurchaseUncertain] = useState(false);
  const [externalReceipt, setExternalReceipt] = useState("");
  const actionInFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/fulfillment-shipping?orderId=${encodeURIComponent(orderId)}`, {
      signal: controller.signal,
      cache: "no-store",
    }).then(readShippingResponse).then((reply) => {
      if (!controller.signal.aborted) setStatus(reply as FulfillmentShippingStatus);
    }).catch(() => {
      if (!controller.signal.aborted) setError("Shipping status could not be loaded. Check status to try again.");
    });
    return () => controller.abort();
  }, [orderId]);

  function applyReply(reply: ShippingReply) {
    setStatus((current) => current ? {
      ...current,
      ...reply,
      label: reply.label === undefined ? current.label : reply.label,
      notification: reply.notification === undefined ? current.notification : reply.notification,
    } : reply as FulfillmentShippingStatus);
    if (reply.label !== undefined) onLabelChange?.(reply.label);
    if (reply.label?.purchaseStatus === "purchased") setPurchaseUncertain(false);
  }

  async function request(action: "prepare" | "purchase" | "complete_tracking" | "record_external_email" | "status") {
    if (actionInFlight.current) return;
    if (action === "purchase" && (!preview?.canPurchase || !preview.token ||
      !preview.expiresAt || !Number.isFinite(Date.parse(preview.expiresAt)) || Date.parse(preview.expiresAt) <= Date.now())) {
      setPreview(null);
      setError("This quote has expired. Prepare the label again for a current price.");
      return;
    }
    actionInFlight.current = true;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const response = action === "status"
        ? await fetch(`/api/admin/fulfillment-shipping?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
        : await fetch("/api/admin/fulfillment-shipping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            orderId,
            ...(action === "purchase" ? { previewToken: preview!.token, confirmPurchase: true } : {}),
            ...(action === "record_external_email" ? { externalReceipt: externalReceipt.trim(), confirmRecorded: true } : {}),
          }),
        });
      const reply = await readShippingResponse(response);
      applyReply(reply);
      if (action === "prepare") setPreview(reply.preview ?? null);
      if (action === "purchase") {
        setPreview(null);
        setNotice(reply.alreadyPurchased ? "The existing label was retrieved. No second label was purchased." : null);
      }
      if (action === "record_external_email") {
        setExternalReceipt("");
        setNotice("Recorded the email already sent. No new email or label was created.");
      }
      if (action === "status" && (reply.label?.purchaseStatus === "needs_review" || reply.label?.purchaseStatus === "purchasing" || purchaseUncertain)) {
        setNotice("Review the existing purchase in Address tools & purchase recovery below before buying again.");
      }
    } catch (caught) {
      if (action === "purchase") {
        setPurchaseUncertain(true);
        setPreview(null);
        try {
          const saved = await fetch(`/api/admin/fulfillment-shipping?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" });
          applyReply(await readShippingResponse(saved));
        } catch { /* Keep the purchase uncertain until its saved status can be read. */ }
      }
      if (action === "prepare") setPreview(null);
      setError(caught instanceof Error ? caught.message : "Shipping could not be updated.");
    } finally {
      actionInFlight.current = false;
      setBusy(null);
    }
  }

  const label = status?.label;
  const purchased = label?.purchaseStatus === "purchased";
  const needsReview = purchaseUncertain || label?.purchaseStatus === "purchasing" || label?.purchaseStatus === "needs_review";
  const isTest = Boolean(status?.testMode || label?.testMode || preview?.testMode);
  const isBusy = busy !== null;
  const canUseFlow = Boolean(status?.enabled && status.configured);
  const canBuy = canUseFlow && Boolean(status?.trackingEmailEnabled) && !purchased && !needsReview && Boolean(preview?.canPurchase && preview.token && preview.expiresAt && Number.isFinite(preview.postageUsd) && Number(preview.postageUsd) > 0);
  const canCompleteTracking = purchased && !isTest && label.isRealShipment && !needsReview && canUseFlow;
  const emailSent = status?.notification?.status === "sent";
  const emailSending = status?.notification?.status === "sending";
  const emailNeedsReview = status?.notification?.status === "needs_review";
  const emailEnabled = Boolean(status?.trackingEmailEnabled);

  return (
    <section aria-label={`Shipping label for ${orderId}`} aria-busy={isBusy} className="mt-4 rounded-xl border border-linen bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-ink">Label &amp; tracking</h3>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${isTest ? "border-amber-300 bg-amber-50 text-amber-800" : "border-linen text-ash"}`}>
          {isTest ? "Test mode" : needsReview ? "Needs review" : purchased ? "Label ready" : !status ? "Checking status" : status.enabled && status.configured ? "Ready for shipping" : "Workflow off"}
        </span>
      </div>

      {!status && !error ? <p className="mt-3 text-sm text-ash" role="status">Loading shipping status…</p> : null}
      {status?.enabled && !purchased && !isTest ? <p className="mt-3 text-sm leading-relaxed text-ash">Verify the address to get a quote. The order’s {serviceName || "saved USPS service"} is selected automatically. After you buy the label, tracking is saved and emailed to the customer.</p> : null}
      {status && !status.enabled ? <p className="mt-3 text-sm leading-relaxed text-ash">The combined label and tracking workflow is off. No purchase or customer email starts automatically.</p> : null}
      {status && !status.configured ? <p className="mt-3 text-sm text-amber-800">Shipping provider setup is incomplete.</p> : null}
      {status && !emailEnabled && !isTest ? <p className="mt-3 text-sm text-ash">Customer tracking emails are off.</p> : null}
      {isTest ? <p className="mt-3 text-sm text-amber-800">Test labels never update customer tracking or send a shipping email.</p> : null}

      {needsReview ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" role="status">
          <p className="font-semibold">Purchase needs checking</p>
          <p className="mt-1 leading-relaxed">A label may already exist. Check the saved status, then use Address tools &amp; purchase recovery to retrieve the existing purchase.</p>
          {label?.lastError ? <p className="mt-2 break-words">{label.lastError}</p> : null}
        </div>
      ) : null}

      {preview && !purchased && !needsReview ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-linen pb-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-ash">Selected order service</p>
              <p className="mt-1 break-words font-semibold text-ink">{preview.serviceName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-ash">Label cost · USD</p>
              <p className="mt-1 font-mono text-xl font-semibold text-ink">{typeof preview.postageUsd === "number" ? usd(preview.postageUsd) : "Unavailable"}</p>
            </div>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0"><dt className="text-xs text-ash">Ship to</dt><dd className="mt-1 whitespace-pre-line break-words text-ink">{preview.destinationSummary}</dd></div>
            <div><dt className="text-xs text-ash">Saved package</dt><dd className="mt-1 text-ink">{preview.package.weightLbs} lb {preview.package.weightOz} oz · {preview.package.depthIn} × {preview.package.widthIn} × {preview.package.heightIn} in</dd></div>
          </dl>
          {preview.blockers.length > 0 ? <ul className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" aria-label="Label purchase blockers">{preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
          {canBuy ? <p className="text-xs leading-relaxed text-ash">Buying this label uses provider credit and saves its tracking number{emailEnabled ? ", then queues the customer email" : ""}. A label does not confirm carrier pickup.</p> : null}
        </div>
      ) : null}

      {purchased ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-ink">{isTest ? "Test label created" : "Label purchased"}</p>
            {typeof label.postageCost === "number" ? <span className="font-mono text-sm text-ink">{usd(label.postageCost)} USD</span> : null}
          </div>
          <div className="rounded-lg border border-linen p-3">
            <p className="text-xs text-ash">{label.carrier ?? "Carrier"} · {label.service ?? "Shipping label"}</p>
            <p className="mt-1 break-all font-mono text-sm text-ink">{label.trackingNumber ?? "Tracking number not available yet"}</p>
          </div>
          {!isTest ? <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" role="status"><span className={status?.trackingSaved ? "text-emerald-800" : "text-amber-800"}>{status?.trackingSaved ? "Tracking saved" : "Tracking not yet saved"}</span><span className={emailSent ? "text-emerald-800" : "text-ash"}>{emailEnabled || status?.notification?.status === "sent" ? notificationLabel(status?.notification) : "Customer email off"}</span></div> : null}
          {status?.notification?.lastError ? <p className="break-words text-sm text-amber-800">{status.notification.lastError}</p> : null}
          {emailNeedsReview ? <p className="text-sm leading-relaxed text-amber-800">Check Sent mail; delivery needs review. No resend will run automatically.</p> : null}
          {label.labelUrl ? <a href={label.labelUrl} target="_blank" rel="noreferrer" className={secondaryButton}>Open / print 4×6 label</a> : null}
          <p className="text-xs leading-relaxed text-ash">Print the label at its original size. Carrier pickup and delivery are separate from label creation.</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {!purchased && !needsReview && status ? (
          <>
            <button type="button" className={preview ? secondaryButton : primaryButton} disabled={isBusy || !canUseFlow} onClick={() => void request("prepare")}>
              {busy === "prepare" ? "Verifying address & getting quote…" : preview ? "Refresh quote" : "Verify address & get quote"}
            </button>
            {preview ? <button type="button" className={primaryButton} disabled={isBusy || !canBuy} onClick={() => void request("purchase")}>
              {busy === "purchase" ? "Buying label & sending tracking…" : isTest ? "Create test label" : `Buy label & send tracking${typeof preview.postageUsd === "number" ? ` · ${usd(preview.postageUsd)}` : ""}`}
            </button> : null}
          </>
        ) : null}
        {canCompleteTracking && (!status?.trackingSaved || (emailEnabled && !emailSent && !emailNeedsReview)) ? <button type="button" className={primaryButton} disabled={isBusy || emailSending} onClick={() => void request("complete_tracking")}>
          {busy === "complete_tracking" ? "Updating tracking…" : !status?.trackingSaved ? emailEnabled && !emailNeedsReview ? "Save tracking & send email" : "Save tracking" : emailSending ? "Email sending…" : "Check / send shipping email"}
        </button> : null}
        {(needsReview || purchased || error) ? <button type="button" className={secondaryButton} disabled={isBusy} onClick={() => void request("status")}>{busy === "status" ? "Checking…" : "Check status"}</button> : null}
      </div>
      {canCompleteTracking && (!status?.trackingSaved || (emailEnabled && !emailSent && !emailNeedsReview)) ? <p className="mt-2 text-xs text-ash">This action uses the existing label. It cannot purchase another one.</p> : null}
      {canCompleteTracking && !emailSent && !emailSending && !emailNeedsReview ? <details className="mt-4 rounded-lg border border-linen p-3">
        <summary className="cursor-pointer py-1 text-sm font-medium text-ash">Already emailed this customer?</summary>
        <p className="mt-2 text-xs leading-relaxed text-ash">After checking Sent mail, record its message reference here to save tracking and prevent a duplicate notification.</p>
        <label className="mt-3 block text-sm text-ink">Sent email reference
          <input value={externalReceipt} onChange={event => setExternalReceipt(event.target.value)} maxLength={150} disabled={isBusy} placeholder="Gmail message ID or sent-message reference" className="mt-1 min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-ink" />
        </label>
        <button type="button" className={`${secondaryButton} mt-3`} disabled={isBusy || !externalReceipt.trim()} onClick={() => void request("record_external_email")}>{busy === "record_external_email" ? "Recording sent email…" : "Record email already sent"}</button>
      </details> : null}
      {notice ? <p className="mt-3 text-sm text-ash" role="status">{notice}</p> : null}
      {error ? <p className="mt-3 break-words text-sm text-red-700" role="alert">{error}</p> : null}
    </section>
  );
}
