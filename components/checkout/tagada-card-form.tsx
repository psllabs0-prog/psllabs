"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  TagadaHeadlessProvider,
  useCheckout,
  usePayment,
  useHeadlessClient,
} from "@tagadapay/headless-sdk/react";

import { Input } from "@/components/ui/input";
import { normalizeCountryCode } from "@/lib/checkout/us-states";
import { pickTagadaShippingRate } from "@/lib/tagada/select-shipping-rate";
import {
  cardSessionStore,
  cardSessionReadyToCharge,
  retryCardConfirmation,
  sanitizeConfirmationHints,
  type CardConfirmationHints,
  type TagadaCardSession,
} from "@/lib/checkout/card-session-storage";
import { cn } from "@/lib/utils";

export type { TagadaCardSession } from "@/lib/checkout/card-session-storage";

type TagadaCardFormProps = {
  session: TagadaCardSession;
  returnHints?: CardConfirmationHints | null;
  onError: (message: string) => void;
  onSuccessRedirect: (redirectTo: string) => void;
};

async function requestCardConfirmation(payload: { orderId: string } & CardConfirmationHints) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("/api/checkout/card", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: controller.signal,
    });
    const data: unknown = await response.json();
    return { status: response.status, json: async () => data };
  } finally { clearTimeout(timer); }
}

/** Expired secrets are discarded while the unresolved original order stays locked. */
export function ExpiredCardConfirmation({ orderId, hints, onError, onSuccessRedirect }: {
  orderId: string;
  hints: CardConfirmationHints | null;
  onError: (message: string) => void;
  onSuccessRedirect: (redirectTo: string) => void;
}) {
  const [busy, setBusy] = useState(!!hints);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const confirm = useCallback((references: CardConfirmationHints) => {
    if (pending.current) return pending.current;
    cardSessionStore.rememberConfirmation(orderId, references);
    const task = (async () => {
      const result = await retryCardConfirmation(orderId, references, requestCardConfirmation);
      setBusy(false);
      if (result.ok) onSuccessRedirect(result.redirectTo);
      else { setError(result.error); onError(result.error); }
    })();
    pending.current = task;
    void task.then(() => { pending.current = null; }, () => { pending.current = null; });
    return task;
  }, [orderId, onError, onSuccessRedirect]);
  const paymentId = hints?.paymentId;
  const tagadaOrderId = hints?.tagadaOrderId;
  const checkoutSessionId = hints?.checkoutSessionId;
  useEffect(() => {
    const references = sanitizeConfirmationHints({ paymentId, tagadaOrderId, checkoutSessionId });
    if (references) void confirm(references);
  }, [paymentId, tagadaOrderId, checkoutSessionId, confirm]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-bold text-ink">Confirm your original order</h1>
      <p className="text-sm text-ash" role="status">
        {busy ? "Checking your payment and order…" : "Your card session expired while payment was unresolved. Confirm this order or contact support before making another payment."}
      </p>
      <p className="text-xs text-stone">Order ID: {orderId}</p>
      {error && <p role="alert" className="text-sm text-signal">{error}</p>}
      {hints && <button type="button" disabled={busy}
        onClick={() => { setBusy(true); setError(null); onError(""); void confirm(hints); }}
        className="inline-flex w-full items-center justify-center rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Confirming order…" : "Retry order confirmation"}
      </button>}
      <a href="/contact" className="text-sm text-primary-blue underline underline-offset-2">Contact support with this order ID</a>
    </div>
  );
}

function TagadaCardFields({
  session,
  returnHints,
  onError,
  onSuccessRedirect,
}: TagadaCardFormProps) {
  const client = useHeadlessClient();
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const retained = useSyncExternalStore(
    cardSessionStore.subscribe, cardSessionStore.getSnapshot, cardSessionStore.getServerSnapshot,
  );
  const context = retained?.orderId === session.orderId ? retained : null;
  const confirmation = context?.confirmation ?? returnHints ?? null;
  const [confirming, setConfirming] = useState(context?.phase !== "ready" || !!confirmation);
  const confirmationRequest = useRef<Promise<void> | null>(null);

  const {
    session: checkoutSession,
    isLoading,
    updateCustomerAndAddress,
    getShippingRates,
    selectShippingRate,
    refresh,
    error: checkoutError,
  } = useCheckout(
    session.checkoutToken || null,
    session.sessionToken ?? undefined
  );

  const confirmPayment = useCallback((hints: CardConfirmationHints) => {
    if (confirmationRequest.current) return confirmationRequest.current;
    // Persist the provider IDs before asking our server to verify them. No card
    // details enter this store, and these IDs never authorize fulfillment.
    cardSessionStore.rememberConfirmation(session.orderId, hints);
    const task = (async () => {
      const result = await retryCardConfirmation(session.orderId, hints, requestCardConfirmation);
      setBusy(false);
      setConfirming(false);
      if (result.ok) {
        onSuccessRedirect(result.redirectTo);
      } else {
        setLocalError(result.error);
        onError(result.error);
      }
    })();
    confirmationRequest.current = task;
    void task.then(() => { confirmationRequest.current = null; }, () => { confirmationRequest.current = null; });
    return task;
  }, [session.orderId, onError, onSuccessRedirect]);

  const hintPaymentId = confirmation?.paymentId;
  const hintOrderId = confirmation?.tagadaOrderId;
  const hintSessionId = confirmation?.checkoutSessionId;
  useEffect(() => {
    const hints = sanitizeConfirmationHints({
      paymentId: hintPaymentId, tagadaOrderId: hintOrderId, checkoutSessionId: hintSessionId,
    });
    if (hints) void confirmPayment(hints);
  }, [hintPaymentId, hintOrderId, hintSessionId, confirmPayment]);

  const { tokenizeCard, processPayment, isProcessing } = usePayment({
    onPaymentSuccess: (result) => {
      const hints = sanitizeConfirmationHints({
        paymentId: result.payment?.id,
        tagadaOrderId: result.order?.id,
        checkoutSessionId: checkoutSession?.id,
      });
      setCardNumber(""); setExpiryDate(""); setCvc(""); setCardholderName("");
      setBusy(false);
      if (!hints || !cardSessionStore.rememberConfirmation(session.orderId, hints, true)) {
        const message = "We couldn't retain your payment reference. Contact support with your order ID before trying another payment.";
        setLocalError(message); onError(message); setConfirming(false);
        return;
      }
      setConfirming(true);
      void confirmPayment(hints);
    },
    onPaymentFailed: (result) => {
      const message =
        typeof result.error === "string"
          ? result.error
          : "Card payment failed. Please try another card.";
      setLocalError(message);
      onError(message);
      setBusy(false);
      setConfirming(false);
      // SDK exceptions can synthesize failure after the charge request began.
      // Retain the lock; only server confirmation can settle the original order.
      const hints = sanitizeConfirmationHints({ paymentId: result.payment?.id, checkoutSessionId: checkoutSession?.id });
      if (hints) cardSessionStore.rememberConfirmation(session.orderId, hints);
    },
  });

  async function handlePay() {
    if (context?.phase !== "ready" || confirmation || confirmationRequest.current) return;
    setLocalError(null);
    onError("");
    setBusy(true);

    const digits = cardNumber.replace(/\s+/g, "");
    if (digits.length < 13) {
      setLocalError("Enter a valid card number.");
      onError("Enter a valid card number.");
      setBusy(false);
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(expiryDate.trim())) {
      setLocalError("Enter expiry as MM/YY.");
      onError("Enter expiry as MM/YY.");
      setBusy(false);
      return;
    }
    if (cvc.trim().length < 3) {
      setLocalError("Enter a valid CVC.");
      onError("Enter a valid CVC.");
      setBusy(false);
      return;
    }

    try {
      if (!checkoutSession?.id) {
        throw new Error("Payment session is still loading. Please wait a moment.");
      }

      await updateCustomerAndAddress({
        customer: {
          email: session.customer.email,
          firstName: session.customer.firstName,
          lastName: session.customer.lastName,
        },
        shippingAddress: {
          line1: session.shippingAddress.line1,
          city: session.shippingAddress.city,
          state: session.shippingAddress.state,
          postalCode: session.shippingAddress.postalCode,
          country: normalizeCountryCode(session.shippingAddress.country),
          firstName: session.customer.firstName,
          lastName: session.customer.lastName,
        },
      });

      const rates = await getShippingRates();
      const pickedRate = pickTagadaShippingRate(rates, session.shippingCost);

      if (process.env.NODE_ENV === "development") {
        console.info("[tagada] shipping rates:", rates);
        console.info("[tagada] expected shipping (USD):", session.shippingCost);
        console.info("[tagada] picked shipping rate:", pickedRate);
        console.info("[tagada] checkout session before shipping select:", {
          items: checkoutSession.items,
          totals: checkoutSession.totals,
          selectedShippingRateId: checkoutSession.selectedShippingRateId,
        });
      }

      if (pickedRate) {
        if (checkoutSession.selectedShippingRateId !== pickedRate.id) {
          await selectShippingRate(pickedRate.id);
        }
        await refresh();
      } else if (process.env.NODE_ENV === "development") {
        console.warn(
          "[tagada] no shipping rates returned — pay-with-token may fail for shippable products"
        );
      }

      const { tagadaToken } = await tokenizeCard({
        cardNumber: digits,
        expiryDate: expiryDate.trim(),
        cvc: cvc.trim(),
        cardholderName: cardholderName.trim() || undefined,
      });

      const freshSession = await client.checkout.loadSession(session.checkoutToken, session.sessionToken ?? undefined);
      if (!cardSessionReadyToCharge(session, freshSession, checkoutSession.id)) {
        throw new Error("The current card checkout total does not match your order. Cancel this checkout and start again, use Bitcoin, or contact support. No card charge was started.");
      }
      if (!cardSessionStore.markProcessing(session.orderId)) {
        throw new Error("Your checkout could not be saved for payment recovery. Enable browser session storage and start a fresh checkout before paying. No card charge was started.");
      }
      const result = await processPayment({
        checkoutSessionId: checkoutSession.id,
        tagadaToken,
        returnUrl: `${window.location.origin}/checkout`,
      });
      if (result.status === "pending" || result.status === "requires_redirect") {
        const hints = sanitizeConfirmationHints({ paymentId: result.paymentId, checkoutSessionId: checkoutSession.id });
        if (hints) {
          cardSessionStore.rememberConfirmation(session.orderId, hints);
          if (result.status === "pending") { setConfirming(true); void confirmPayment(hints); }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Card payment failed. Please try again.";
      setLocalError(message);
      onError(message);
      setBusy(false);
    }
  }

  const paymentLocked = context?.phase !== "ready" || !!confirmation;
  const disabled = busy || isProcessing || isLoading || !checkoutSession?.id || paymentLocked;

  if (paymentLocked) {
    return (
      <div className="mt-5 flex flex-col gap-4 border-t border-linen pt-5">
        <p className="text-sm text-ash" role="status">
          {confirming || isProcessing
            ? "Confirming your payment and order…"
            : "Your payment needs order confirmation. Keep your order ID for support."}
        </p>
        <p className="text-xs text-stone">Order ID: {session.orderId}</p>
        {localError && <p role="alert" className="text-sm text-signal">{localError}</p>}
        {confirmation ? (
          <button type="button" disabled={confirming || isProcessing}
            onClick={() => { setConfirming(true); setLocalError(null); onError(""); void confirmPayment(confirmation); }}
            className="inline-flex w-full items-center justify-center rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page disabled:cursor-not-allowed disabled:opacity-50">
            {confirming || isProcessing ? "Confirming order…" : "Retry order confirmation"}
          </button>
        ) : (
          <p className="text-sm text-ash">If your bank has finished and this page does not update, contact support with your order ID before making another payment.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-4 border-t border-linen pt-5">
      <p className="text-sm text-ash">
        Card details are tokenized by Tagada and never sent to PSL Labs servers.
      </p>

      {(localError || checkoutError) && (
        <p role="alert" className="text-sm text-signal">
          {localError ?? checkoutError?.message}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tagada-cardholder" className="text-sm font-medium text-ink">
          Name on card
        </label>
        <Input
          id="tagada-cardholder"
          autoComplete="cc-name"
          placeholder="Name on card"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          disabled={busy || isProcessing}
          className="h-11 rounded-lg border-linen bg-paper px-3 placeholder:text-stone"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tagada-pan" className="text-sm font-medium text-ink">
          Card number
        </label>
        <Input
          id="tagada-pan"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="0000 0000 0000 0000"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          disabled={busy || isProcessing}
          className="h-11 rounded-lg border-linen bg-paper px-3 font-mono placeholder:text-stone"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tagada-exp" className="text-sm font-medium text-ink">
            Expiry (MM/YY)
          </label>
          <Input
            id="tagada-exp"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM / YY"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            disabled={busy || isProcessing}
            className="h-11 rounded-lg border-linen bg-paper px-3 font-mono placeholder:text-stone"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tagada-cvc" className="text-sm font-medium text-ink">
            CVC
          </label>
          <Input
            id="tagada-cvc"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="CVC"
            value={cvc}
            onChange={(e) => setCvc(e.target.value)}
            disabled={busy || isProcessing}
            className="h-11 rounded-lg border-linen bg-paper px-3 font-mono placeholder:text-stone"
          />
        </div>
      </div>

      <p className="text-xs leading-relaxed text-stone">
        Capital One-issued cards may be declined. Please use a card from another
        issuer.
      </p>

      <button
        type="button"
        onClick={() => void handlePay()}
        disabled={disabled}
        className={cn(
          "inline-flex w-full items-center justify-center rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page transition-opacity hover:opacity-90",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      >
        {busy || isProcessing
          ? "Processing card…"
          : isLoading || !checkoutSession?.id
            ? "Preparing card payment…"
            : "Pay by card"}
      </button>
    </div>
  );
}

export function TagadaCardForm(props: TagadaCardFormProps) {
  const environment = useMemo(() => {
    const env = process.env.NEXT_PUBLIC_TAGADA_ENVIRONMENT?.trim();
    if (env === "development" || env === "sandbox") return "development" as const;
    return "production" as const;
  }, []);

  return (
    <TagadaHeadlessProvider
      storeId={props.session.storeId}
      environment={environment}
    >
      <TagadaCardFields {...props} />
    </TagadaHeadlessProvider>
  );
}
