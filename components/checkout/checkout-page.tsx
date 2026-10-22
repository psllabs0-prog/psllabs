"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Bitcoin, Check, CreditCard } from "lucide-react";

import {
  TagadaCardForm,
  ExpiredCardConfirmation,
  type TagadaCardSession,
} from "@/components/checkout/tagada-card-form";
import { useCart } from "@/components/cart/cart-provider";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import { formatPrice } from "@/lib/cart/format";
import { DISCOUNT_CODES_ENABLED } from "@/lib/checkout/discount-codes-config";
import { ProductPrice } from "@/components/commerce/product-price";
import { REFERRAL_CODE_FIELD_VISIBLE } from "@/lib/partners/referral-logic";
import { computeTotals, type OrderTotals } from "@/lib/checkout/totals";
import { PRIORITY_BASE_SHIPPING_USD, PRIORITY_DISCOUNTED_SHIPPING_USD } from "@/lib/shipping/policy";
import { trackPlausibleClientEvent } from "@/lib/plausible/client";
import { US_COUNTRY, US_COUNTRY_LABEL, US_STATES } from "@/lib/checkout/us-states";
import { getOrderAttributionForCheckout } from "@/lib/attribution/storage";
import { cardCartFingerprint, cardShippingContextFingerprint, cardSessionMatchesShipping, cardSessionMatchesCart, cardSessionStore, getCardReturnHints, type CardShippingContext } from "@/lib/checkout/card-session-storage";
import type { ShippingOptionsResponse, ShippingSelection } from "@/lib/shipping/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import styles from "./checkout-page.module.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function subscribeToCheckoutUrl(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
const getCheckoutSearch = () => window.location.search;
const getServerCheckoutSearch = () => "";

type FormState = {
  email: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;
type PaymentMethod = "btcpay" | "card";

const FIELD_IDS: Record<keyof FormState, string> = {
  email: "checkout-email",
  firstName: "checkout-first-name",
  lastName: "checkout-last-name",
  address: "checkout-address",
  city: "checkout-city",
  state: "checkout-state",
  zip: "checkout-zip",
};

const initialForm: FormState = {
  email: "",
  firstName: "",
  lastName: "",
  address: "",
  city: "",
  state: "",
  zip: "",
};

const selectClassName =
  "h-11 w-full rounded-lg border border-linen bg-lab-white px-3 text-base text-ink outline-none focus-visible:border-primary-blue focus-visible:ring-3 focus-visible:ring-primary-blue/20 md:text-sm";

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-signal"> *</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-signal">
          {error}
        </p>
      )}
    </div>
  );
}

function validateForm(form: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!form.email.trim()) {
    errors.email = "Email is required.";
  } else if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (!form.firstName.trim()) errors.firstName = "First name is required.";
  if (!form.lastName.trim()) errors.lastName = "Last name is required.";
  if (!form.address.trim()) errors.address = "Address is required.";
  if (!form.city.trim()) errors.city = "City is required.";
  if (!form.state.trim()) errors.state = "State is required.";
  if (!form.zip.trim()) errors.zip = "ZIP code is required.";

  return errors;
}

function CheckoutLoadingShell() {
  return (
    <main className={cn("storefront-theme public-page-surface min-h-screen bg-paper px-6 py-12 md:px-16 md:py-16 lg:px-24 lg:py-20", styles.page)}>
      <div className="mx-auto max-w-[1100px]">
        <header className="public-page-header mb-8 md:mb-10">
          <p className="mono text-ash">CHECKOUT</p>
          <h1 className="font-display text-display-lg font-bold text-ink">
            Review your order
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-ash md:text-base">
            Loading your cart…
          </p>
        </header>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] lg:gap-10">
          <div className="premium-card public-section-card h-[520px] animate-pulse bg-soft-blue/20 p-5 md:p-6" />
          <div className="hidden lg:block">
            <div className="premium-card public-section-card h-[360px] animate-pulse bg-soft-blue/20 p-6" />
          </div>
        </div>
      </div>
    </main>
  );
}

export function CheckoutPage({ visualPreview = false }: { visualPreview?: boolean }) {
  const { lines, isHydrated } = useCart();

  const retainedSnapshot = useSyncExternalStore(
    cardSessionStore.subscribe, cardSessionStore.getSnapshot, cardSessionStore.getServerSnapshot,
  );
  // A design preview must never mount a real provider or resume a retained payment.
  const retained = visualPreview ? null : retainedSnapshot;
  const search = useSyncExternalStore(subscribeToCheckoutUrl, getCheckoutSearch, getServerCheckoutSearch);
  const returnHints = useMemo(() => getCardReturnHints(search), [search]);
  const isCardReturn = !visualPreview && new URLSearchParams(search).get("paymentAction") === "requireAction";
  const tagadaSession = retained?.session ?? null;
  const paymentUnresolved = !!retained && retained.phase !== "ready";
  const [formOverrides, setForm] = useState<Partial<FormState>>({});
  const form: FormState = tagadaSession ? {
      email: tagadaSession.customer.email, firstName: tagadaSession.customer.firstName,
      lastName: tagadaSession.customer.lastName, address: tagadaSession.shippingAddress.line1,
      city: tagadaSession.shippingAddress.city, state: tagadaSession.shippingAddress.state,
      zip: tagadaSession.shippingAddress.postalCode,
    } : { ...initialForm, ...formOverrides };
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [selectedMethod, setMethod] = useState<PaymentMethod | null>("btcpay");
  const method = tagadaSession ? "card" : selectedMethod;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const handleCardError = useCallback((message: string) => setPayError(message || null), [setPayError]);
  const handleCardSuccess = useCallback((redirectTo: string) => {
    cardSessionStore.clear();
    window.location.assign(redirectTo);
  }, []);
  const [discountInput, setDiscountInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    percent: number;
    exclusive?: boolean;
  } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [discountApplying, setDiscountApplying] = useState(false);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);
  const [shippingChoice, setShippingChoice] = useState<{ method: "standard" } | { method: "priority"; context: string; token: string }>({ method: "standard" });
  const [shippingOptions, setShippingOptions] = useState<{ context: string; status: "loading" | "ready" | "error"; data?: ShippingOptionsResponse } | null>(null);
  const [quoteClock, setQuoteClock] = useState(0);
  const shippingRequest = JSON.stringify({ email: form.email, shipping: {
    firstName: form.firstName, lastName: form.lastName, address: form.address, city: form.city,
    state: form.state, zip: form.zip, country: US_COUNTRY,
  }, items: lines.map(({ handle, quantity }) => ({ handle, quantity })),
    ...(appliedDiscount ? { discountCode: appliedDiscount.code } : {}), paymentMethod: method });
  const shippingContext = `${shippingRequest}:${cardCartFingerprint(lines)}`;
  const addressComplete = EMAIL_PATTERN.test(form.email.trim()) &&
    [form.firstName, form.lastName, form.address, form.city, form.state].every(value => value.trim()) && /^\d{5}(?:-\d{4})?$/.test(form.zip.trim());
  const canCheckShipping = !visualPreview && !retained && addressComplete && lines.length > 0;
  const currentOptions = shippingOptions?.context === shippingContext ? shippingOptions : null;
  const priority = currentOptions?.status === "ready" && currentOptions.data?.priority.available &&
    Date.parse(currentOptions.data.priority.expiresAt) > quoteClock ? currentOptions.data.priority : null;
  const prioritySelected = shippingChoice.method === "priority" && shippingChoice.context === shippingContext &&
    priority?.quoteToken === shippingChoice.token;
  const shippingInvalid = !tagadaSession && shippingChoice.method === "priority" && !prioritySelected;
  const shippingMethod = tagadaSession?.shippingMethod ?? (prioritySelected ? "priority" : "standard");

  useEffect(() => {
    if (!canCheckShipping) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setShippingOptions({ context: shippingContext, status: "loading" });
      void (async () => {
        try {
          const response = await fetch("/api/checkout/shipping-options", { method: "POST", headers: { "Content-Type": "application/json" },
            body: shippingRequest, signal: controller.signal, cache: "no-store" });
          const data = await response.json() as ShippingOptionsResponse;
          if (!response.ok || !data.standard || typeof data.standard.priceUsd !== "number" || !data.priority ||
              (data.priority.available && (!data.priority.quoteToken || ![PRIORITY_BASE_SHIPPING_USD, PRIORITY_DISCOUNTED_SHIPPING_USD].includes(data.priority.priceUsd) ||
                !Number.isFinite(Date.parse(data.priority.expiresAt)) || !data.priority.selection))) throw new Error("Shipping options unavailable");
          if (!controller.signal.aborted) { setQuoteClock(Date.now()); setShippingOptions({ context: shippingContext, status: "ready", data }); }
        } catch {
          if (!controller.signal.aborted) setShippingOptions({ context: shippingContext, status: "error" });
        }
      })();
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [canCheckShipping, shippingContext, shippingRequest]);

  useEffect(() => {
    if (!priority) return;
    const timer = setTimeout(() => setQuoteClock(Date.now()), Math.max(0, Date.parse(priority.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [priority]);

  const subtotalRaw = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );
  const computedTotals = computeTotals(subtotalRaw, form.state, appliedDiscount, {
    paymentMethod: method,
    shippingMethod,
  });
  const totals: OrderTotals = tagadaSession?.pricing ? { ...computedTotals, ...tagadaSession.pricing,
    discountPercent: tagadaSession.pricing.subtotal > 0 ? tagadaSession.pricing.discountAmount / tagadaSession.pricing.subtotal * 100 : 0,
    bitcoinDiscountAmount: 0, bitcoinDiscountPercent: 0, taxRate: 0,
    shipping: tagadaSession.shippingCost, total: tagadaSession.total } : computedTotals;
  const shippingDescription = tagadaSession
    ? tagadaSession.shippingDescription ?? (tagadaSession.shippingMethod === "priority" ? "USPS Priority Mail" : tagadaSession.shippingMethod === "standard" ? "USPS Ground Advantage" : "Saved shipping service")
    : shippingMethod === "priority" ? "USPS Priority Mail" : "USPS Ground Advantage";
  const shippingEstimate = (tagadaSession?.shippingEstimate ?? (prioritySelected ? priority?.selection.deliveryEstimate ?? null : null))
    ?.replace(/\s+after carrier acceptance/gi, "") ?? null;
  function cardShippingContext(): CardShippingContext {
    return { method: shippingMethod, quote: tagadaSession?.shippingQuote ?? (prioritySelected ? priority?.quoteToken ?? null : null),
      email: form.email, address: { firstName: form.firstName, lastName: form.lastName, address: form.address,
        city: form.city, state: form.state, zip: form.zip, country: US_COUNTRY },
      discountCode: tagadaSession?.pricing?.discountCode ?? appliedDiscount?.code ?? null, paymentMethod: method };
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "email") { setAppliedDiscount(null); setDiscountMessage(null); }
    if (errors[key]) {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
  }

  function buildCheckoutPayload() {
    const attribution = getOrderAttributionForCheckout();
    return {
      currency: "USD",
      shippingMethod,
      ...(prioritySelected && priority ? { shippingQuote: priority.quoteToken } : {}),
      email: form.email,
      shipping: {
        firstName: form.firstName,
        lastName: form.lastName,
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        country: US_COUNTRY,
      },
      items: lines.map((line) => ({
        handle: line.handle,
        quantity: line.quantity,
      })),
      paymentMethod:
        method === "btcpay"
          ? "bitcoin"
          : method === "card"
            ? "card"
            : undefined,
      ...(appliedDiscount ? { discountCode: appliedDiscount.code } : {}),
      ...(attribution ? { attribution } : {}),
    };
  }

  async function handleApplyDiscount() {
    setDiscountError(null);
    setDiscountMessage(null);
    if (visualPreview) { setDiscountError("Referral code checks are available on the live site."); return; }
    const code = discountInput.trim();
    if (!code) {
      setDiscountError("Enter a discount code.");
      return;
    }

    setDiscountApplying(true);
    try {
      const res = await fetch("/api/checkout/apply-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal: subtotalRaw, email: form.email }),
      });
      const data = (await res.json()) as {
        code?: string;
        discountPercent?: number;
        exclusive?: boolean;
        supportedPaymentMethods?: string[];
        message?: string;
        error?: string;
      };

      if (!res.ok || !data.code || typeof data.discountPercent !== "number") {
        setAppliedDiscount(null);
        setDiscountError(data.error ?? "Invalid or expired code");
        return;
      }

      setAppliedDiscount({
        code: data.code,
        percent: data.discountPercent,
        exclusive: data.exclusive === true,
      });
      setDiscountInput(data.code);
      setDiscountMessage(data.message ?? null);
      setDiscountError(method === "card" && data.supportedPaymentMethods && !data.supportedPaymentMethods.includes("card")
        ? "The first-order referral discount is not configured for card checkout yet. Choose Bitcoin for this discount or remove the code to pay the regular card price." : null);
    } catch {
      setDiscountError("Unable to validate discount code. Please try again.");
    } finally {
      setDiscountApplying(false);
    }
  }

  function handleRemoveDiscount() {
    setAppliedDiscount(null);
    setDiscountInput("");
    setDiscountError(null);
    setDiscountMessage(null);
  }

  async function handleBtcpaySubmit() {
    if (visualPreview) { setPayError("Design preview only. Payments and order creation are disabled."); return; }
    cardSessionStore.clear();
    setPayError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCheckoutPayload()),
      });

      const data = (await res.json()) as {
        checkoutLink?: string;
        error?: string;
      };

      if (!res.ok || !data.checkoutLink) {
        setPayError(data.error ?? "Checkout failed");
        setIsSubmitting(false);
        return;
      }

      window.location.assign(data.checkoutLink);
    } catch {
      setPayError("We couldn't start checkout. Please try again.");
      setIsSubmitting(false);
    }
  }

  async function handleCardSessionStart() {
    if (visualPreview) { setPayError("Design preview only. Payments and order creation are disabled."); return; }
    setPayError(null);
    setIsSubmitting(true);
    cardSessionStore.clear();

    try {
      const res = await fetch("/api/checkout/card/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCheckoutPayload()),
      });

      const data = (await res.json()) as TagadaCardSession & {
        error?: string;
        storeId?: string;
        shippingSelection?: ShippingSelection;
      };

      if (!res.ok || !data.orderId || !data.checkoutToken || !data.storeId) {
        setPayError(data.error ?? "Unable to start card checkout.");
        setIsSubmitting(false);
        return;
      }

      const saved = cardSessionStore.start({
        orderId: data.orderId,
        checkoutToken: data.checkoutToken,
        sessionToken: data.sessionToken ?? null,
        storeId: data.storeId,
        customer: data.customer,
        shippingAddress: data.shippingAddress,
        items: data.items,
        shippingCost: data.shippingCost ?? totals.shipping,
        total: data.total,
        ...(data.pricing ? { pricing: data.pricing } : {}),
        shippingMethod: data.shippingMethod,
        tagadaShippingRateId: data.tagadaShippingRateId,
        ...(data.shippingQuote ? { shippingQuote: data.shippingQuote } : {}),
        ...(data.shippingQuoteExpiresAt ? { shippingQuoteExpiresAt: data.shippingQuoteExpiresAt } : {}),
        shippingDescription: data.shippingSelection?.serviceDisplayName,
        shippingEstimate: data.shippingSelection?.deliveryEstimate ?? null,
        shippingContextFingerprint: cardShippingContextFingerprint(cardShippingContext()),
        cartFingerprint: cardCartFingerprint(lines),
      });
      if (!saved) setPayError("We couldn't restore a valid card checkout session. Please try again.");
      setIsSubmitting(false);
    } catch {
      setPayError("We couldn't start card payment. Please try again.");
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (retained || isSubmitting || isCardReturn) return;
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitted(true);
    if (Object.keys(nextErrors).length > 0) {
      const firstInvalidField = Object.keys(nextErrors)[0] as keyof FormState;
      requestAnimationFrame(() => document.getElementById(FIELD_IDS[firstInvalidField])?.focus());
      return;
    }
    if (visualPreview) { setPayError("Design preview only. Payments and order creation are disabled."); return; }

    if (shippingInvalid) {
      setPayError("Your previous shipping quote changed or expired. Select Standard or review the new Priority option before continuing.");
      document.getElementById("checkout-shipping-heading")?.focus();
      return;
    }

    if (method === "btcpay") {
      trackPlausibleClientEvent("checkout_started", { payment: "bitcoin" });
      void handleBtcpaySubmit();
      return;
    }

    if (method === "card") {
      trackPlausibleClientEvent("checkout_started", { payment: "card" });
      void handleCardSessionStart();
      return;
    }

    setPayError("Select a payment method to continue.");
  }

  if (!isHydrated) {
    return <CheckoutLoadingShell />;
  }

  if (isCardReturn && !retained) {
    return (
      <main className={cn("storefront-theme public-page-surface min-h-[60vh] bg-paper px-6 py-16 md:px-16 md:py-20 lg:px-24", styles.page)}>
        <div className="mx-auto max-w-lg text-center">
          <h1 className="font-display text-display-md font-bold text-ink">Check your card payment</h1>
          <p role="alert" className="mt-4 text-ash">
            Your original checkout session is no longer available in this tab. Contact support to confirm your payment before placing another order.
          </p>
          <Link href="/contact" className="mt-6 inline-flex rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page">Contact support</Link>
        </div>
      </main>
    );
  }

  if (retained && !retained.session) {
    return (
      <main className={cn("storefront-theme public-page-surface min-h-[60vh] bg-paper px-6 py-16 md:px-16 md:py-20 lg:px-24", styles.page)}>
        <div className="premium-card public-section-card mx-auto max-w-lg p-6">
          <ExpiredCardConfirmation orderId={retained.orderId} hints={retained.confirmation ?? returnHints}
            onError={handleCardError} onSuccessRedirect={handleCardSuccess} />
        </div>
      </main>
    );
  }

  if (tagadaSession && retained?.phase === "ready" && !isCardReturn &&
      !cardSessionMatchesShipping(tagadaSession, cardShippingContext())) {
    return (
      <main className={cn("storefront-theme public-page-surface min-h-[60vh] bg-paper px-6 py-16 md:px-16 md:py-20 lg:px-24", styles.page)}>
        <div className="premium-card public-section-card mx-auto max-w-lg p-6">
          <h1 className="font-display text-display-md font-bold text-ink">Review your checkout details</h1>
          <p className="mt-4 text-ash">Start a new checkout to review your shipping choice and current quote before payment.</p>
          <button type="button" onClick={() => cardSessionStore.clear()} className="mt-6 inline-flex rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page">Start new checkout</button>
        </div>
      </main>
    );
  }

  if (tagadaSession && retained?.phase === "ready" && !isCardReturn && !cardSessionMatchesCart(tagadaSession, lines)) {
    return (
      <main className={cn("storefront-theme public-page-surface min-h-[60vh] bg-paper px-6 py-16 md:px-16 md:py-20 lg:px-24", styles.page)}>
        <div className="premium-card public-section-card mx-auto max-w-lg p-6">
          <h1 className="font-display text-display-md font-bold text-ink">Your cart has changed</h1>
          <p className="mt-4 text-ash">Start a new checkout to review the current items and prices before paying.</p>
          <button type="button" onClick={() => cardSessionStore.clear()} className="mt-6 inline-flex rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page">Start new checkout</button>
        </div>
      </main>
    );
  }

  if (lines.length === 0 && tagadaSession) {
    return (
      <main className={cn("storefront-theme public-page-surface min-h-[60vh] bg-paper px-6 py-16 md:px-16 md:py-20 lg:px-24", styles.page)}>
        <div className="premium-card public-section-card mx-auto max-w-lg p-6">
          <h1 className="font-display text-display-md font-bold text-ink">Your card checkout</h1>
          <TagadaCardForm key={tagadaSession.orderId} session={tagadaSession} returnHints={returnHints}
            onError={handleCardError} onSuccessRedirect={handleCardSuccess} />
          {retained?.phase === "ready" && !isCardReturn && (
            <button type="button" onClick={() => cardSessionStore.clear()} className="mt-4 text-sm text-primary-blue underline underline-offset-2">Cancel card checkout</button>
          )}
        </div>
      </main>
    );
  }

  if (lines.length === 0) {
    return (
      <main className={cn("storefront-theme public-page-surface min-h-[60vh] bg-paper px-6 py-16 md:px-16 md:py-20 lg:px-24", styles.page)}>
        <div className="mx-auto max-w-lg text-center">
          <h1 className="font-display text-display-md font-bold text-ink">
            Checkout
          </h1>
          <p className="mt-4 text-ash">Your cart is empty.</p>
          <Link
            href="/products"
            className="mt-6 inline-flex rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page transition-opacity hover:opacity-90"
          >
            Browse Catalog
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={cn("storefront-theme public-page-surface min-h-screen bg-paper px-6 py-12 md:px-16 md:py-16 lg:px-24 lg:py-20", styles.page)}>
      <div className="mx-auto max-w-[1100px]">
        <header className="public-page-header mb-8 md:mb-10">
          <p className="mono text-ash">CHECKOUT</p>
          <h1 className="font-display text-display-lg font-bold text-ink">
            Review your order
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-ash md:text-base">
            Complete your contact and shipping details, then pay securely with
            Bitcoin or card.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] lg:gap-10">
          <form
            onSubmit={handleSubmit}
            noValidate
            className={cn("flex flex-col gap-8", styles.form)}
          >
            <section className="premium-card public-section-card p-5 md:p-6">
              <h2 className="font-display text-lg font-bold text-ink">
                Contact Information
              </h2>
              <div className="mt-5">
                <Field
                  id="checkout-email"
                  label="Email address"
                  required
                  error={submitted ? errors.email : undefined}
                >
                  <Input
                    id="checkout-email"
                    type="email"
                    disabled={!!tagadaSession || isSubmitting}
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    aria-invalid={!!errors.email}
                    aria-describedby={
                      errors.email ? "checkout-email-error" : undefined
                    }
                    className="h-11 rounded-lg border-linen bg-lab-white px-3 text-base md:text-sm"
                  />
                </Field>
              </div>
            </section>

            <section className="premium-card public-section-card p-5 md:p-6">
              <h2 className="font-display text-lg font-bold text-ink">
                Shipping Information
              </h2>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="checkout-first-name"
                  label="First name"
                  required
                  error={submitted ? errors.firstName : undefined}
                >
                  <Input
                    id="checkout-first-name"
                    autoComplete="given-name"
                    disabled={!!tagadaSession || isSubmitting}
                    value={form.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    aria-invalid={!!errors.firstName}
                    aria-describedby={errors.firstName ? "checkout-first-name-error" : undefined}
                    className="h-11 rounded-lg border-linen bg-lab-white px-3 text-base md:text-sm"
                  />
                </Field>
                <Field
                  id="checkout-last-name"
                  label="Last name"
                  required
                  error={submitted ? errors.lastName : undefined}
                >
                  <Input
                    id="checkout-last-name"
                    autoComplete="family-name"
                    disabled={!!tagadaSession || isSubmitting}
                    value={form.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    aria-invalid={!!errors.lastName}
                    aria-describedby={errors.lastName ? "checkout-last-name-error" : undefined}
                    className="h-11 rounded-lg border-linen bg-lab-white px-3 text-base md:text-sm"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    id="checkout-address"
                    label="Address"
                    required
                    error={submitted ? errors.address : undefined}
                  >
                    <Input
                      id="checkout-address"
                      autoComplete="street-address"
                      disabled={!!tagadaSession || isSubmitting}
                      value={form.address}
                      onChange={(e) => updateField("address", e.target.value)}
                      aria-invalid={!!errors.address}
                      aria-describedby={errors.address ? "checkout-address-error" : undefined}
                      className="h-11 rounded-lg border-linen bg-lab-white px-3 text-base md:text-sm"
                    />
                  </Field>
                </div>
                <Field
                  id="checkout-city"
                  label="City"
                  required
                  error={submitted ? errors.city : undefined}
                >
                  <Input
                    id="checkout-city"
                    autoComplete="address-level2"
                    disabled={!!tagadaSession || isSubmitting}
                    value={form.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    aria-invalid={!!errors.city}
                    aria-describedby={errors.city ? "checkout-city-error" : undefined}
                    className="h-11 rounded-lg border-linen bg-lab-white px-3 text-base md:text-sm"
                  />
                </Field>
                <Field
                  id="checkout-state"
                  label="State"
                  required
                  error={submitted ? errors.state : undefined}
                >
                  <select
                    id="checkout-state"
                    autoComplete="address-level1"
                    disabled={!!tagadaSession || isSubmitting}
                    value={form.state}
                    onChange={(e) => updateField("state", e.target.value)}
                    className={selectClassName}
                    aria-invalid={!!errors.state}
                    aria-describedby={errors.state ? "checkout-state-error" : undefined}
                  >
                    <option value="">Select state</option>
                    {US_STATES.map((state) => (
                      <option key={state.value} value={state.value}>
                        {state.label} — {state.value}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  id="checkout-zip"
                  label="ZIP code"
                  required
                  error={submitted ? errors.zip : undefined}
                >
                  <Input
                    id="checkout-zip"
                    autoComplete="postal-code"
                    disabled={!!tagadaSession || isSubmitting}
                    value={form.zip}
                    onChange={(e) => updateField("zip", e.target.value)}
                    aria-invalid={!!errors.zip}
                    aria-describedby={errors.zip ? "checkout-zip-error" : undefined}
                    className="h-11 rounded-lg border-linen bg-lab-white px-3 text-base md:text-sm"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="checkout-country" label="Country" required>
                    <Input
                      id="checkout-country"
                      autoComplete="country-name"
                      value={US_COUNTRY_LABEL}
                      disabled
                      readOnly
                      className="h-11 cursor-not-allowed rounded-lg border-linen bg-soft-blue/40 px-3 text-base text-ash md:text-sm"
                    />
                  </Field>
                  <p className="mt-2 text-xs leading-relaxed text-ash">
                    PSL Labs currently ships within the United States only.
                  </p>
                </div>
              </div>
            </section>

            <section className="premium-card public-section-card p-5 md:p-6" aria-labelledby="checkout-shipping-heading">
              <h2 id="checkout-shipping-heading" tabIndex={-1} className="font-display text-lg font-bold text-ink">Shipping method</h2>
              {tagadaSession && !tagadaSession.shippingMethod ? <p className="mt-3 text-sm text-ash">Shipping from your original order: {formatPrice(tagadaSession.shippingCost)}. The saved session does not identify its carrier service. Confirm the original payment before starting another checkout.</p> : <fieldset className="mt-4 space-y-3" disabled={!!tagadaSession || isSubmitting}>
                <legend className="sr-only">Choose a shipping method</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-linen p-4">
                  <input type="radio" name="shipping-method" value="standard" checked={tagadaSession ? shippingMethod === "standard" : shippingChoice.method === "standard"}
                    onChange={() => { setShippingChoice({ method: "standard" }); setPayError(null); }} className="mt-1 size-4 accent-accent" />
                  <span className="flex-1 text-sm"><span className="flex justify-between gap-3 font-medium text-ink"><span>Standard · USPS Ground Advantage</span><span>{(tagadaSession && shippingMethod === "standard" ? totals.shipping : computeTotals(subtotalRaw).shipping) === 0 ? "Free" : "$9.99"}</span></span>
                    <span className="mt-1 block text-xs leading-relaxed text-ash">Usually 2–5 business days for most contiguous U.S. addresses. Alaska, Hawaii and remote destinations can take longer.</span></span>
                </label>
                {(priority || tagadaSession?.shippingMethod === "priority") && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-linen p-4">
                  <input type="radio" name="shipping-method" value="priority" checked={!!tagadaSession || !!prioritySelected}
                    onChange={() => { if (priority) { setShippingChoice({ method: "priority", context: shippingContext, token: priority.quoteToken }); setPayError(null); } }} className="mt-1 size-4 accent-accent" />
                  <span className="flex-1 text-sm"><span className="flex justify-between gap-3 font-medium text-ink"><span>USPS Priority Mail</span><span>{formatPrice(tagadaSession ? totals.shipping : priority!.priceUsd)}</span></span>
                    <span className="mt-1 block text-xs leading-relaxed text-ash">{(tagadaSession?.shippingEstimate || priority?.selection.deliveryEstimate || "Usually 2–3 business days for most addresses; remote destinations can take longer.").replace(/\s+after carrier acceptance/gi, "")}</span></span>
                </label>}
              </fieldset>}
              {shippingInvalid && <p role="alert" className="mt-3 text-sm text-signal">Your address, cart, discount or payment choice changed, or the Priority quote expired. Select Standard or review and select the current Priority option before paying.</p>}
              {!tagadaSession && !priority && <p role="status" className="mt-3 text-xs leading-relaxed text-ash">{
                !addressComplete ? "Standard is selected by default. Complete your contact and full shipping address to check any additional options." :
                canCheckShipping && (!currentOptions || currentOptions.status === "loading") ? "Checking additional shipping options. Standard remains available." :
                currentOptions?.status === "error" ? "We couldn’t check additional shipping options. Standard remains available; you can continue with it." :
                "Additional shipping options are unavailable for these details. Standard remains available."
              }</p>}
              <p className="mt-3 text-xs leading-relaxed text-ash">Orders are processed within 24 hours. Transit begins when the carrier receives the parcel; delivery times are estimates.</p>
            </section>

            {!paymentUnresolved && !isCardReturn && <div className="premium-card public-section-card p-5 md:p-6 lg:hidden">
              <CheckoutSummary
                lines={lines}
                totals={totals}
                shippingDescription={shippingDescription}
                shippingEstimate={shippingEstimate}
                discountInput={discountInput}
                onDiscountInputChange={setDiscountInput}
                onApplyDiscount={() => void handleApplyDiscount()}
                onRemoveDiscount={handleRemoveDiscount}
                discountApplying={discountApplying}
                discountError={discountError}
                appliedCode={tagadaSession?.pricing?.discountCode ?? appliedDiscount?.code ?? null}
                discountMessage={discountMessage}
                discountLocked={!!tagadaSession}
                showDiscount={DISCOUNT_CODES_ENABLED || REFERRAL_CODE_FIELD_VISIBLE}
              />
            </div>}

            <section className="premium-card public-section-card p-5 md:p-6">
              <h2 className="font-display text-lg font-bold text-ink">
                Payment Method
              </h2>
              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMethod("btcpay");
                    setPayError(null);
                    setDiscountError(null);
                    cardSessionStore.clear();
                  }}
                  disabled={paymentUnresolved || isSubmitting || isCardReturn}
                  aria-pressed={method === "btcpay"}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    method === "btcpay"
                      ? "border-primary-blue bg-soft-blue/40 ring-2 ring-primary-blue/20"
                      : "border-linen bg-lab-white hover:border-primary-blue/50"
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-linen bg-soft-blue/50">
                    <Bitcoin
                      className="size-5 text-biotech-deep"
                      strokeWidth={1.6}
                      aria-hidden
                    />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">
                        Pay with Bitcoin
                      </span>
                      <span className="inline-flex items-center rounded-pill border border-accent/35 bg-accent/10 px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-accent">
                        {appliedDiscount?.exclusive ? "Referral 10%" : "Save 5%"}
                      </span>
                    </div>
                    <span className="text-xs leading-relaxed text-ash">
                      {appliedDiscount?.exclusive ? "The 10% first-order referral discount replaces the standard Bitcoin savings." : "Pay with Bitcoin and save 5% on your subtotal."}
                      {" "}You&apos;ll be redirected to our secure BTCPay checkout.
                    </span>
                  </div>
                  {method === "btcpay" && (
                    <Check
                      className="mt-0.5 size-5 shrink-0 text-primary-blue"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMethod("card");
                    setPayError(null);
                    setDiscountError(null);
                    cardSessionStore.clear();
                  }}
                  disabled={paymentUnresolved || isSubmitting || isCardReturn}
                  aria-pressed={method === "card"}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    method === "card"
                      ? "border-primary-blue bg-soft-blue/40 ring-2 ring-primary-blue/20"
                      : "border-linen bg-lab-white hover:border-primary-blue/50"
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-linen bg-soft-blue/50">
                    <CreditCard
                      className="size-5 text-biotech-deep"
                      strokeWidth={1.6}
                      aria-hidden
                    />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-medium text-ink">
                      Credit / Debit Card
                    </span>
                    <span className="text-xs leading-relaxed text-ash">
                      Pay with a card. Details are tokenized by Tagada and never
                      touch our servers.
                    </span>
                  </div>
                  {method === "card" && (
                    <Check
                      className="mt-0.5 size-5 shrink-0 text-primary-blue"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                </button>
              </div>

              {payError && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-signal/30 bg-signal/5 px-4 py-3 text-sm text-signal"
                >
                  {payError}
                </p>
              )}

              {method === "card" && tagadaSession ? (
                <>
                  <TagadaCardForm key={tagadaSession.orderId} session={tagadaSession} returnHints={returnHints}
                    onError={handleCardError} onSuccessRedirect={handleCardSuccess} />
                  {!paymentUnresolved && !isCardReturn && (
                    <button type="button" onClick={() => { cardSessionStore.clear(); setPayError(null); }}
                      className="mt-4 text-sm text-primary-blue underline underline-offset-2">Cancel card checkout</button>
                  )}
                </>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting || !method}
                  className={cn("mt-5 inline-flex w-full items-center justify-center rounded-pill bg-accent px-6 py-3.5 text-base font-medium text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50", styles.primaryButton)}
                >
                  {isSubmitting
                    ? method === "card"
                      ? "Preparing card payment…"
                      : "Starting checkout…"
                    : method === "card"
                      ? "Continue to card payment"
                      : "Continue to Bitcoin payment"}
                </button>
              )}
            </section>
          </form>

          {!paymentUnresolved && !isCardReturn && <aside className="hidden lg:block">
            <div className="sticky top-24 premium-card public-section-card p-6">
              <CheckoutSummary
                lines={lines}
                totals={totals}
                shippingDescription={shippingDescription}
                shippingEstimate={shippingEstimate}
                discountInput={discountInput}
                onDiscountInputChange={setDiscountInput}
                onApplyDiscount={() => void handleApplyDiscount()}
                onRemoveDiscount={handleRemoveDiscount}
                discountApplying={discountApplying}
                discountError={discountError}
                appliedCode={tagadaSession?.pricing?.discountCode ?? appliedDiscount?.code ?? null}
                discountMessage={discountMessage}
                discountLocked={!!tagadaSession}
                showDiscount={DISCOUNT_CODES_ENABLED || REFERRAL_CODE_FIELD_VISIBLE}
              />
            </div>
          </aside>}
        </div>
      </div>
    </main>
  );
}

function CheckoutSummary({
  lines,
  totals,
  shippingDescription,
  shippingEstimate,
  discountInput,
  onDiscountInputChange,
  onApplyDiscount,
  onRemoveDiscount,
  discountApplying,
  discountError,
  appliedCode,
  discountMessage,
  discountLocked,
  showDiscount,
}: {
  lines: ReturnType<typeof useCart>["lines"];
  totals: OrderTotals;
  shippingDescription: string;
  shippingEstimate: string | null;
  discountInput: string;
  onDiscountInputChange: (value: string) => void;
  onApplyDiscount: () => void;
  onRemoveDiscount: () => void;
  discountApplying: boolean;
  discountError: string | null;
  appliedCode: string | null;
  discountMessage: string | null;
  discountLocked: boolean;
  showDiscount: boolean;
}) {
  const codeDiscountAmount = Math.max(
    0,
    Math.round((totals.discountAmount - totals.bitcoinDiscountAmount) * 100) / 100
  );
  return (
    <div className={cn("flex flex-col gap-5", styles.summary)}>
      <h2 className="font-display text-lg font-bold text-ink">Order Summary</h2>
      <ul className="flex flex-col gap-3 border-b border-linen pb-4">
        {lines.map((line) => (
          <li
            key={line.handle}
            className={cn("flex items-start justify-between gap-3 text-sm", styles.summaryLine)}
          >
            <div className={styles.summaryImage}>
              <Image src={line.imageSrc} alt={line.imageAlt} width={48} height={56} className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink">{line.name}</p>
              <p className="text-xs text-ash">
                {line.strength} · Qty {line.quantity}
              </p>
            </div>
            <p className="shrink-0 font-mono font-medium text-ink">
              <ProductPrice handle={line.handle} unitPrice={line.unitPrice} quantity={line.quantity} size="compact" stacked />
            </p>
          </li>
        ))}
      </ul>

      {/* Discount codes temporarily disabled — infrastructure kept for re-enable. */}
      {showDiscount && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="checkout-discount"
            className="text-sm font-medium text-ink"
          >
            Discount or partner code
          </label>
          <div className="flex gap-2">
            <Input
              id="checkout-discount"
              value={discountInput}
              onChange={(e) => onDiscountInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onApplyDiscount();
                }
              }}
              placeholder="Enter code"
              autoComplete="off"
              disabled={discountApplying || discountLocked}
              className="h-11 rounded-lg border-linen bg-lab-white px-3 text-base uppercase md:text-sm"
            />
            <button
              type="button"
              onClick={onApplyDiscount}
              disabled={discountApplying || discountLocked}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-linen bg-lab-white px-4 text-sm font-medium text-ink transition-colors hover:border-primary-blue/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {discountApplying ? "…" : "Apply"}
            </button>
          </div>
          {discountError && (
            <p role="alert" className="text-xs text-signal">
              {discountError}
            </p>
          )}
          {discountMessage && <p role="status" className="text-xs text-accent">{discountMessage}</p>}
          {appliedCode && !discountLocked && (
            <button
              type="button"
              onClick={onRemoveDiscount}
              className="self-start text-xs font-medium text-primary-blue underline underline-offset-2"
            >
              Remove {appliedCode}
            </button>
          )}
        </div>
      )}

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between text-ash">
          <dt>Subtotal</dt>
          <dd className="font-mono text-ink">{formatPrice(totals.subtotal)}</dd>
        </div>
        {totals.bitcoinDiscountAmount > 0 && (
          <div className="flex justify-between text-accent">
            <dt>Bitcoin discount (5%)</dt>
            <dd className="font-mono">
              -{formatPrice(totals.bitcoinDiscountAmount)}
            </dd>
          </div>
        )}
        {showDiscount && codeDiscountAmount > 0 && totals.discountCode && (
          <div className="flex justify-between text-accent">
            <dt>Discount ({totals.discountCode.replace(/\+BTC$/, "")})</dt>
            <dd className="font-mono">-{formatPrice(codeDiscountAmount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-ash">
          <dt>Shipping · {shippingDescription}</dt>
          <dd
            className={cn(
              "font-mono text-ink",
              totals.shipping === 0 && "font-medium text-accent"
            )}
          >
            {totals.shipping === 0 ? "Free" : formatPrice(totals.shipping)}
          </dd>
        </div>
        <div className="mt-2 flex justify-between border-t border-linen pt-3">
          <dt className="font-medium text-ink">Total</dt>
          <dd className="font-mono text-lg font-medium text-ink">
            {formatPrice(totals.total)}
          </dd>
        </div>
      </dl>
      {shippingEstimate && <p className="text-xs leading-relaxed text-ash">Carrier estimate: {shippingEstimate}</p>}
      {totals.bitcoinDiscountAmount > 0 && (
        <p className="text-xs leading-relaxed text-ash">
          Bitcoin is selected. The 5% subtotal discount is included in this total.
        </p>
      )}
      <p className="text-xs leading-relaxed text-ash">
        Standard Ground Advantage is free at a product subtotal of ${FREE_SHIPPING_THRESHOLD} or more before discounts; otherwise $9.99.
      </p>
    </div>
  );
}
