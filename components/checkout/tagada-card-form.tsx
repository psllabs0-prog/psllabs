"use client";

import { useEffect, useMemo, useState } from "react";
import {
  TagadaHeadlessProvider,
  useCheckout,
  usePayment,
} from "@tagadapay/headless-sdk/react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type TagadaCardSession = {
  orderId: string;
  checkoutToken: string;
  sessionToken: string | null;
  storeId: string;
  customer: {
    email: string;
    firstName: string;
    lastName: string;
  };
  shippingAddress: {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  items: Array<{ variantId: string; quantity: number }>;
};

type TagadaCardFormProps = {
  session: TagadaCardSession;
  onError: (message: string) => void;
  onSuccessRedirect: (redirectTo: string) => void;
};

function TagadaCardFields({
  session,
  onError,
  onSuccessRedirect,
}: TagadaCardFormProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardholderName, setCardholderName] = useState(
    `${session.customer.firstName} ${session.customer.lastName}`.trim()
  );
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

  const {
    session: checkoutSession,
    isLoading,
    createSession,
    updateCustomerAndAddress,
    error: checkoutError,
  } = useCheckout(
    session.checkoutToken || null,
    session.sessionToken ?? undefined
  );

  const { tokenizeCard, processPayment, isProcessing } = usePayment({
    onPaymentSuccess: (result) => {
      void (async () => {
        try {
          const paymentId =
            result.payment && typeof result.payment === "object" && "id" in result.payment
              ? String((result.payment as { id?: string }).id ?? "")
              : "";
          const tagadaOrderId =
            result.order && typeof result.order === "object" && "id" in result.order
              ? String((result.order as { id?: string }).id ?? "")
              : "";

          const res = await fetch("/api/checkout/card", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: session.orderId,
              checkoutSessionId: checkoutSession?.id,
              paymentId: paymentId || undefined,
              tagadaOrderId: tagadaOrderId || undefined,
            }),
          });
          const data = (await res.json()) as {
            redirectTo?: string;
            error?: string;
          };
          if (!res.ok || !data.redirectTo) {
            onError(
              data.error ??
                "Payment succeeded but we couldn't confirm the order. Contact support."
            );
            setBusy(false);
            return;
          }
          onSuccessRedirect(data.redirectTo);
        } catch {
          onError(
            "Payment succeeded but confirmation failed. Contact support with your order ID."
          );
          setBusy(false);
        }
      })();
    },
    onPaymentFailed: (result) => {
      const message =
        typeof result.error === "string"
          ? result.error
          : "Card payment failed. Please try another card.";
      setLocalError(message);
      onError(message);
      setBusy(false);
    },
  });

  // If tokens alone don't hydrate a session, create one client-side with the
  // reserved line items (still uses Tagada — never hits our server with PANs).
  useEffect(() => {
    if (bootstrapped || isLoading || checkoutSession?.id) return;

    let cancelled = false;
    setBootstrapped(true);

    void (async () => {
      try {
        await createSession({
          items: session.items,
          currency: "USD",
          returnUrl: `${window.location.origin}/checkout`,
          customerEmail: session.customer.email,
        });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to prepare card payment session.";
        setLocalError(message);
        onError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    bootstrapped,
    isLoading,
    checkoutSession?.id,
    createSession,
    session.items,
    session.customer.email,
    onError,
  ]);

  async function handlePay() {
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
          country: session.shippingAddress.country,
          firstName: session.customer.firstName,
          lastName: session.customer.lastName,
        },
      });

      const { tagadaToken } = await tokenizeCard({
        cardNumber: digits,
        expiryDate: expiryDate.trim(),
        cvc: cvc.trim(),
        cardholderName: cardholderName.trim() || undefined,
      });

      await processPayment({
        checkoutSessionId: checkoutSession.id,
        tagadaToken,
      });
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

  const disabled = busy || isProcessing || isLoading || !checkoutSession?.id;

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
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          disabled={busy || isProcessing}
          className="h-11 rounded-lg border-linen bg-paper px-3"
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
          placeholder="4242 4242 4242 4242"
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          disabled={busy || isProcessing}
          className="h-11 rounded-lg border-linen bg-paper px-3 font-mono"
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
            placeholder="12/28"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            disabled={busy || isProcessing}
            className="h-11 rounded-lg border-linen bg-paper px-3 font-mono"
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
            placeholder="123"
            value={cvc}
            onChange={(e) => setCvc(e.target.value)}
            disabled={busy || isProcessing}
            className="h-11 rounded-lg border-linen bg-paper px-3 font-mono"
          />
        </div>
      </div>

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
