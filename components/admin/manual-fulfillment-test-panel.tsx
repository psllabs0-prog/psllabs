"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import type { ManualFulfillmentTestAddress, ManualFulfillmentTestReply, ManualFulfillmentTestStatus } from "@/lib/fulfillment/manual-test-types";
import type { FulfillmentShippingPreview } from "@/lib/fulfillment/shipping-flow-types";

type TestReply = ManualFulfillmentTestReply & { ok?: boolean };
type Action = "create_test_order" | "update_test_address" | "prepare" | "purchase" | "retrieve" | "send_test_email" | "status";

const endpoint = "/api/admin/fulfillment-test";
const primary = "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-page transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border-strong px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const addressInput = "mt-1 block min-h-11 w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";
const emptyAddress: ManualFulfillmentTestAddress = { address: "", street2: "", city: "", state: "", zip: "" };

function normalizedAddress(address: ManualFulfillmentTestAddress): ManualFulfillmentTestAddress {
  return { address: address.address.trim(), street2: address.street2.trim(), city: address.city.trim(), state: address.state.trim().toUpperCase(), zip: address.zip.trim() };
}

async function readReply(response: Response): Promise<TestReply> {
  const reply = await response.json() as TestReply;
  if (!response.ok || reply.ok === false) throw new Error(reply.error || "The test could not be updated. Check its saved status before trying again.");
  if (reply.testOnly !== true || reply.orderId !== "psl_manual_qa_luke_20261016" || reply.recipient !== "lukeghaz@gmail.com") {
    throw new Error("This is not the expected test order. No test action is available.");
  }
  return reply;
}

export function ManualFulfillmentTestPanel() {
  const [data, setData] = useState<ManualFulfillmentTestStatus | null>(null);
  const [preview, setPreview] = useState<FulfillmentShippingPreview | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purchaseUncertain, setPurchaseUncertain] = useState(false);
  const [emailUncertain, setEmailUncertain] = useState(false);
  const [addressForm, setAddressForm] = useState<ManualFulfillmentTestAddress>(emptyAddress);
  const [addressNotice, setAddressNotice] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal, cache: "no-store" }).then(readReply).then((reply) => {
      if (!controller.signal.aborted) {
        setData(reply);
        setAddressForm(reply.testAddress ?? emptyAddress);
      }
    }).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Test order could not be loaded.");
    });
    return () => controller.abort();
  }, []);

  async function act(action: Action) {
    if (inFlight.current) return;
    if (action === "update_test_address" && !data?.canEditTestAddress) {
      setError("The test address is locked because label or email activity already exists.");
      return;
    }
    if (action === "purchase" && (!preview?.token || !preview.canPurchase || !preview.testMode ||
      !preview.expiresAt || !Number.isFinite(Date.parse(preview.expiresAt)) || Date.parse(preview.expiresAt) <= Date.now())) {
      setPreview(null);
      setError("The test quote expired. Prepare it again before creating a label.");
      return;
    }
    inFlight.current = true;
    setBusy(action);
    setError(null);
    setAddressNotice(null);
    try {
      const response = action === "status"
        ? await fetch(endpoint, { cache: "no-store" })
        : await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action,
            ...(action === "purchase" ? { previewToken: preview!.token, confirmPurchase: true } : {}),
            ...(action === "update_test_address" ? normalizedAddress(addressForm) : {}),
          }),
        });
      const reply = await readReply(response);
      setData(reply);
      if (action === "status" || action === "create_test_order" || action === "update_test_address") setAddressForm(reply.testAddress ?? emptyAddress);
      if (action === "update_test_address") {
        setPreview(null);
        setAddressNotice("Test address saved. Prepare a new test quote when you are ready.");
      }
      if (action === "prepare") setPreview(reply.preview ?? null);
      if (reply.shippingStatus?.label?.purchaseStatus === "purchased") {
        setPreview(null);
        setPurchaseUncertain(false);
      }
      if (reply.testEmail.status === "smtp_accepted") setEmailUncertain(false);
    } catch (caught) {
      if (action === "prepare") setPreview(null);
      let message = caught instanceof Error ? caught.message : "The test could not be updated.";
      if (action === "purchase" || action === "retrieve") {
        setPurchaseUncertain(true);
        setPreview(null);
        try {
          const saved = await readReply(await fetch(endpoint, { cache: "no-store" }));
          setData(saved);
          if (saved.shippingStatus?.label?.purchaseStatus === "purchased") setPurchaseUncertain(false);
        } catch { message += " Saved status could not be refreshed. Retrieve the existing test label before trying to create another one."; }
      }
      if (action === "send_test_email") setEmailUncertain(true);
      setError(message);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const label = data?.shippingStatus?.label;
  const purchased = label?.purchaseStatus === "purchased";
  const purchaseNeedsReview = purchaseUncertain || label?.purchaseStatus === "needs_review" || label?.purchaseStatus === "purchasing";
  const unexpectedLabel = Boolean(label && (label.purchaseStatus === "purchased" || label.isRealShipment) && !label.testMode);
  const emailSent = data?.testEmail.status === "smtp_accepted";
  const emailHeld = emailUncertain || data?.testEmail.status === "claimed" || data?.testEmail.status === "needs_review";
  const canEditAddress = Boolean(data?.canEditTestAddress && !purchased && !purchaseNeedsReview && !emailHeld && !emailSent && !data?.shippingStatus?.trackingSaved);
  const addressDirty = canEditAddress && JSON.stringify(normalizedAddress(addressForm)) !== JSON.stringify(normalizedAddress(data?.testAddress ?? emptyAddress));
  const ready = Boolean(data?.exists && data.providerConfigured && data.senderReady && !unexpectedLabel && !addressDirty);
  const isBusy = busy !== null;
  const canPurchase = ready && Boolean(preview?.canPurchase && preview.token && preview.testMode) && !purchased && !purchaseNeedsReview;
  const canEmail = ready && purchased && Boolean(label?.testMode && label.trackingNumber && data?.smtpReady) && !emailSent && !emailHeld;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-accent/25 bg-surface" aria-label="Fake order details">
        <div className="flex items-center gap-4 p-5 sm:gap-6 sm:p-6">
          <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg bg-page sm:w-24" aria-hidden="true">
            <Image src="/products/renders/retatrutide-cutout.webp" alt="" width={88} height={110} className="h-24 w-auto object-contain" />
          </div>
          <div className="min-w-0">
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Test only · no shipment</span>
            <h2 className="mt-3 break-words font-display text-lg font-semibold text-ink">Test order — lukeghaz@gmail.com</h2>
            <p className="mt-1 text-sm leading-relaxed text-ash">Practice the label and tracking steps with a fake order. No customer payment or inventory is involved.</p>
          </div>
        </div>
        {data?.exists ? <dl className="grid gap-4 border-t border-linen px-5 py-4 text-sm sm:grid-cols-3 sm:px-6">
          <div className="min-w-0"><dt className="text-xs text-ash">Order number</dt><dd className="mt-1 break-all font-mono text-xs text-ink">{data.orderId}</dd></div>
          <div><dt className="text-xs text-ash">Service</dt><dd className="mt-1 text-ink">{data.serviceName}</dd></div>
          <div><dt className="text-xs text-ash">Package</dt><dd className="mt-1 text-ink">{data.package.weightLbs} lb {data.package.weightOz} oz · {data.package.depthIn} × {data.package.widthIn} × {data.package.heightIn} in</dd></div>
        </dl> : null}
      </section>

      {!data && !error ? <p role="status" className="text-sm text-ash">Loading the test order…</p> : null}
      {data && !data.exists ? <section className="rounded-xl border border-linen bg-surface p-5 sm:p-6" aria-label="Create the fake order">
        <h2 className="font-display text-lg font-semibold text-ink">Create your test order</h2>
        <p className="mt-2 text-sm leading-relaxed text-ash">This creates only the separate fake order. It does not create a label, charge a payment or send an email.</p>
        <button type="button" className={`${primary} mt-4`} disabled={isBusy} onClick={() => void act("create_test_order")}>{busy === "create_test_order" ? "Creating test order…" : "Create test order"}</button>
      </section> : null}
      {data?.exists && (!data.providerConfigured || !data.senderReady) ? <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{!data.providerConfigured ? "The shipping connection needs setup. " : ""}{!data.senderReady ? "The sender address needs attention before a test label can be created." : ""}</p> : null}
      {unexpectedLabel ? <p role="alert" className="text-sm text-red-700">Unexpected label state. Testing is blocked; check the saved status.</p> : null}

      {data?.exists ? <>
        <section className="rounded-xl border border-linen bg-surface p-5 sm:p-6" aria-label="Test delivery address" aria-busy={busy === "update_test_address"}>
          <h2 className="font-display text-lg font-semibold text-ink">Test delivery address</h2>
          <p className="mt-2 text-sm leading-relaxed text-ash">Used only for this fake order and its USPS test label. The recipient email remains <span className="break-all text-ink">lukeghaz@gmail.com</span>.</p>
          <div className="mt-4 rounded-lg border border-linen bg-page p-3">
            <p className="text-xs font-medium text-ash">Saved test destination</p>
            {data.testAddress ? <address className="mt-1 break-words text-sm not-italic text-ink">
              {data.testAddress.address}<br />
              {data.testAddress.street2 ? <>{data.testAddress.street2}<br /></> : null}
              {data.testAddress.city}, {data.testAddress.state} {data.testAddress.zip}<br />United States
            </address> : <p className="mt-1 text-sm text-ash">No test address saved yet.</p>}
          </div>
          {canEditAddress ? <form className="mt-4 grid gap-4 sm:grid-cols-2" autoComplete="off" onSubmit={(event) => { event.preventDefault(); void act("update_test_address"); }}>
            <label className="text-sm font-medium text-ink sm:col-span-2" htmlFor="manual-test-street">Street address
              <input id="manual-test-street" className={addressInput} value={addressForm.address} required maxLength={200} disabled={isBusy} onChange={(event) => { setAddressForm(current => ({ ...current, address: event.target.value })); setPreview(null); setAddressNotice(null); }} />
            </label>
            <label className="text-sm font-medium text-ink sm:col-span-2" htmlFor="manual-test-street2">Address line 2 <span className="font-normal text-ash">(optional)</span>
              <input id="manual-test-street2" className={addressInput} value={addressForm.street2} maxLength={100} disabled={isBusy} onChange={(event) => { setAddressForm(current => ({ ...current, street2: event.target.value })); setPreview(null); setAddressNotice(null); }} />
            </label>
            <label className="text-sm font-medium text-ink sm:col-span-2" htmlFor="manual-test-city">City
              <input id="manual-test-city" className={addressInput} value={addressForm.city} required maxLength={100} disabled={isBusy} onChange={(event) => { setAddressForm(current => ({ ...current, city: event.target.value })); setPreview(null); setAddressNotice(null); }} />
            </label>
            <label className="text-sm font-medium text-ink" htmlFor="manual-test-state">State
              <input id="manual-test-state" className={addressInput} value={addressForm.state} required maxLength={2} pattern="[A-Za-z]{2}" placeholder="Two-letter code" disabled={isBusy} onChange={(event) => { setAddressForm(current => ({ ...current, state: event.target.value.toUpperCase() })); setPreview(null); setAddressNotice(null); }} />
            </label>
            <label className="text-sm font-medium text-ink" htmlFor="manual-test-zip">ZIP code
              <input id="manual-test-zip" className={addressInput} value={addressForm.zip} required maxLength={10} pattern="[0-9]{5}(-[0-9]{4})?" inputMode="numeric" disabled={isBusy} onChange={(event) => { setAddressForm(current => ({ ...current, zip: event.target.value })); setPreview(null); setAddressNotice(null); }} />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={primary} disabled={isBusy || !addressDirty}>{busy === "update_test_address" ? "Saving test address…" : "Save test address"}</button>
              <p className="mt-2 text-xs leading-relaxed text-ash">Saving the address clears any old quote. It does not request a quote, create a label or send an email.</p>
              {addressDirty ? <p className="mt-2 text-sm text-amber-800">Save the test address before preparing a quote.</p> : null}
            </div>
          </form> : <p className="mt-3 text-sm leading-relaxed text-ash">The test address is locked once label or tracking-email activity exists.</p>}
          {addressNotice ? <p role="status" className="mt-3 text-sm text-emerald-800">{addressNotice}</p> : null}
        </section>

        <section className="rounded-xl border border-linen bg-surface p-5 sm:p-6" aria-label="Create a USPS test label" aria-busy={busy === "prepare" || busy === "purchase" || busy === "retrieve"}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">USPS test label</h2>
            <span className="text-xs font-medium text-ash">No postage charge</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ash">Use the saved service and package. Creating a test label does not send an email.</p>

          {preview && !purchased && !purchaseNeedsReview ? <div className="mt-4 space-y-3 border-t border-linen pt-4">
            <div className="flex flex-wrap justify-between gap-3"><p className="font-medium text-ink">{preview.serviceName}</p><p className="text-sm text-ash">Postage estimate (test only): <span className="font-mono text-ink">{typeof preview.postageUsd === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(preview.postageUsd) : "Unavailable"}</span></p></div>
            <p className="whitespace-pre-line text-sm text-ash">{preview.destinationSummary}</p>
            <p className="text-xs leading-relaxed text-ash">This is a test quote. No paid postage will be purchased.</p>
            {preview.blockers.length ? <ul aria-label="Test label blockers" className="space-y-1 text-sm text-amber-800">{preview.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul> : null}
          </div> : null}

          {purchaseNeedsReview ? <p role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-800">A test label may already exist. Check its status or retrieve the existing purchase before trying again.</p> : null}
          {purchased && !unexpectedLabel ? <div className="mt-4 space-y-3 border-t border-linen pt-4">
            <p role="status" className="text-sm font-medium text-emerald-800">Test label created</p>
            <p className="break-all font-mono text-sm text-ink">{label.trackingNumber || "Test tracking number not available yet"}</p>
            {label.labelUrl ? <a href={label.labelUrl} target="_blank" rel="noreferrer" className={secondary}>Open / print test label</a> : null}
            <p className="text-xs leading-relaxed text-ash">For testing; not valid postage.</p>
          </div> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {!purchased && !purchaseNeedsReview ? <button type="button" className={preview ? secondary : primary} disabled={isBusy || !ready} onClick={() => void act("prepare")}>{busy === "prepare" ? "Preparing test quote…" : preview ? "Refresh test quote" : "Prepare test quote"}</button> : null}
            {preview && !purchased && !purchaseNeedsReview ? <button type="button" className={primary} disabled={isBusy || !canPurchase} onClick={() => void act("purchase")}>{busy === "purchase" ? "Creating test label…" : "Create USPS test label"}</button> : null}
            {purchaseNeedsReview || (purchased && (!label.trackingNumber || !label.labelUrl)) ? <button type="button" className={secondary} disabled={isBusy || !ready} onClick={() => void act("retrieve")}>{busy === "retrieve" ? "Retrieving…" : "Retrieve test label"}</button> : null}
          </div>
        </section>

        <section className="rounded-xl border border-linen bg-surface p-5 sm:p-6" aria-label="Send the test tracking email" aria-busy={busy === "send_test_email"}>
          <h2 className="font-display text-lg font-semibold text-ink">Test tracking email</h2>
          <p className="mt-2 text-sm leading-relaxed text-ash">Save tracking on this fake order and send one clearly marked TEST email to <span className="break-all text-ink">lukeghaz@gmail.com</span>. This step runs only when you press the button.</p>
          {data.shippingStatus?.trackingSaved ? <p className="mt-3 text-sm text-emerald-800">Test tracking saved</p> : null}
          {emailSent ? <div role="status" className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-800">The mail server accepted the TEST email. Check your inbox and spam folder to confirm arrival. No second email will be sent.</div> : emailHeld ? <div role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-800">Email delivery needs review. Check your inbox and Sent mail, then refresh the status. No automatic resend is allowed.</div> : <>
            {!data.smtpReady ? <p className="mt-3 text-sm text-amber-800">Email setup needs attention before the TEST message can be sent.</p> : null}
            {!purchased ? <p className="mt-3 text-xs text-ash">Create the USPS test label first.</p> : null}
            <button type="button" className={`${primary} mt-4`} disabled={isBusy || !canEmail} onClick={() => void act("send_test_email")}>{busy === "send_test_email" ? "Saving test tracking & sending…" : "Save test tracking & send one TEST email"}</button>
          </>}
        </section>
      </> : null}

      {error ? <p role="alert" className="break-words text-sm leading-relaxed text-red-700">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={secondary} disabled={isBusy} onClick={() => void act("status")}>{busy === "status" ? "Checking status…" : "Refresh test status"}</button>
        <a href="/admin-fulfillment" className="text-sm text-ash underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Back to fulfillment</a>
      </div>
    </div>
  );
}
