"use client";

import Link from "next/link";
import { useState } from "react";
import { Bitcoin, Check, CreditCard } from "lucide-react";

import { useCart } from "@/components/cart/cart-provider";
import { formatPrice } from "@/lib/cart/format";
import { computeTotals, type OrderTotals } from "@/lib/checkout/totals";
import { US_COUNTRY, US_STATES } from "@/lib/checkout/us-states";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function PaymentOption({
  icon,
  label,
  helperText,
}: {
  icon: React.ReactNode;
  label: string;
  helperText: string;
}) {
  return (
    <div
      aria-disabled
      className="flex cursor-not-allowed items-start gap-3 rounded-xl border border-linen bg-lab-white/70 p-4 opacity-70"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-linen bg-soft-blue/50">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-xs leading-relaxed text-ash">{helperText}</span>
      </div>
      <span className="badge-accent mt-0.5 shrink-0">Coming soon</span>
    </div>
  );
}

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

export function CheckoutPage() {
  const { lines, isHydrated } = useCart();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [method, setMethod] = useState<"btcpay" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const isEmpty = !isHydrated || lines.length === 0;

  const subtotalRaw = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );
  const totals = computeTotals(subtotalRaw, form.state);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitted(true);
    if (Object.keys(nextErrors).length > 0) return;

    if (method !== "btcpay") {
      setPayError("Select a payment method to continue.");
      return;
    }

    setPayError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currency: "USD",
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
        }),
      });

      const data = (await res.json()) as {
        checkoutLink?: string;
        error?: string;
      };

      if (!res.ok || !data.checkoutLink) {
        throw new Error(data.error ?? "Checkout failed");
      }

      window.location.href = data.checkoutLink;
    } catch {
      setPayError("We couldn't start checkout. Please try again.");
      setIsSubmitting(false);
    }
  }

  if (isHydrated && isEmpty) {
    return (
      <main className="section-surface-ice min-h-[60vh] px-6 py-16 md:px-16 md:py-20 lg:px-24">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="font-display text-display-md font-bold text-ink">
            Checkout
          </h1>
          <p className="mt-4 text-ash">Your cart is empty.</p>
          <Link
            href="/products"
            className="mt-6 inline-flex rounded-pill bg-ink px-6 py-3.5 text-base font-medium text-lab-white transition-opacity hover:opacity-90"
          >
            Start Shopping
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="section-surface-ice min-h-screen px-6 py-12 md:px-16 md:py-16 lg:px-24 lg:py-20">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-8 md:mb-10">
          <p className="mono text-ash">CHECKOUT</p>
          <h1 className="font-display text-display-lg font-bold text-ink">
            Review your order
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-ash md:text-base">
            Complete your contact and shipping details, then pay securely with
            Bitcoin.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] lg:gap-10">
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-col gap-8"
          >
            <section className="premium-card p-5 md:p-6">
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

            <section className="premium-card p-5 md:p-6">
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
                    value={form.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
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
                    value={form.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
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
                      value={form.address}
                      onChange={(e) => updateField("address", e.target.value)}
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
                    value={form.city}
                    onChange={(e) => updateField("city", e.target.value)}
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
                    value={form.state}
                    onChange={(e) => updateField("state", e.target.value)}
                    className={selectClassName}
                    aria-invalid={!!errors.state}
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
                    value={form.zip}
                    onChange={(e) => updateField("zip", e.target.value)}
                    className="h-11 rounded-lg border-linen bg-lab-white px-3 text-base md:text-sm"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="checkout-country" label="Country" required>
                    <Input
                      id="checkout-country"
                      autoComplete="country-name"
                      value={US_COUNTRY}
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

            <div className="premium-card p-5 md:p-6 lg:hidden">
              <CheckoutSummary lines={lines} totals={totals} />
            </div>

            <section className="premium-card p-5 md:p-6">
              <h2 className="font-display text-lg font-bold text-ink">
                Payment Method
              </h2>
              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMethod("btcpay");
                    setPayError(null);
                  }}
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
                    <span className="text-sm font-medium text-ink">
                      Bitcoin via BTCPay
                    </span>
                    <span className="text-xs leading-relaxed text-ash">
                      Pay with Bitcoin. You&apos;ll be redirected to our secure
                      BTCPay checkout.
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
                <PaymentOption
                  icon={
                    <CreditCard
                      className="size-5 text-biotech-deep"
                      strokeWidth={1.6}
                      aria-hidden
                    />
                  }
                  label="Card or bank payment"
                  helperText="Available after payment processor approval."
                />
              </div>

              {payError && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-signal/30 bg-signal/5 px-4 py-3 text-sm text-signal"
                >
                  {payError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || method !== "btcpay"}
                className="mt-5 inline-flex w-full items-center justify-center rounded-pill bg-ink px-6 py-3.5 text-base font-medium text-lab-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting
                  ? "Starting checkout…"
                  : "Continue to Bitcoin payment"}
              </button>
            </section>
          </form>

          <aside className="hidden lg:block">
            <div className="sticky top-24 premium-card p-6">
              <CheckoutSummary lines={lines} totals={totals} />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function CheckoutSummary({
  lines,
  totals,
}: {
  lines: ReturnType<typeof useCart>["lines"];
  totals: OrderTotals;
}) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-display text-lg font-bold text-ink">Order Summary</h2>
      <ul className="flex flex-col gap-3 border-b border-linen pb-4">
        {lines.map((line) => (
          <li
            key={line.handle}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium text-ink">{line.name}</p>
              <p className="text-xs text-ash">
                {line.strength} · Qty {line.quantity}
              </p>
            </div>
            <p className="shrink-0 font-medium text-ink">
              {formatPrice(line.unitPrice * line.quantity)}
            </p>
          </li>
        ))}
      </ul>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between text-ash">
          <dt>Subtotal</dt>
          <dd className="text-ink">{formatPrice(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between text-ash">
          <dt>Shipping</dt>
          <dd
            className={cn(
              "text-ink",
              totals.shipping === 0 && "font-medium text-verified-green"
            )}
          >
            {totals.shipping === 0 ? "Free" : formatPrice(totals.shipping)}
          </dd>
        </div>
        {totals.tax > 0 && (
          <div className="flex justify-between text-ash">
            <dt>Tax ({(totals.taxRate * 100).toFixed(2)}%)</dt>
            <dd className="text-ink">{formatPrice(totals.tax)}</dd>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-linen pt-3">
          <dt className="font-display font-bold text-ink">Total</dt>
          <dd className="font-display text-lg font-bold text-ink">
            {formatPrice(totals.total)}
          </dd>
        </div>
      </dl>
      <p className="text-xs leading-relaxed text-ash">
        Free U.S. shipping over $150. Tax applies to Arizona addresses.
      </p>
    </div>
  );
}
