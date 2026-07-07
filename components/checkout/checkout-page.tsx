"use client";

import Link from "next/link";
import { useState } from "react";
import { Bitcoin, CreditCard } from "lucide-react";

import { useCart } from "@/components/cart/cart-provider";
import { formatPrice } from "@/lib/cart/format";
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
  const { lines, subtotal, estimatedTotal, shippingDisplay, isHydrated } =
    useCart();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const isEmpty = !isHydrated || lines.length === 0;

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key]) {
      setErrors((current) => ({ ...current, [key]: undefined }));
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitted(true);
    if (Object.keys(nextErrors).length > 0) return;
    // Demo flow — no order creation yet.
    // TODO: Send order receipt email via lib/email/order-receipt.ts after payment setup is finalized.
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
            Complete your contact and shipping details. Payment is not active
            yet—this is an inquiry and review flow only.
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
              <CheckoutSummary
                lines={lines}
                subtotal={subtotal}
                estimatedTotal={estimatedTotal}
                shippingDisplay={shippingDisplay}
              />
            </div>

            <section className="premium-card p-5 md:p-6">
              <h2 className="font-display text-lg font-bold text-ink">
                Payment Method
              </h2>
              <div className="mt-5 flex flex-col gap-3">
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
                <PaymentOption
                  icon={
                    <Bitcoin
                      className="size-5 text-biotech-deep"
                      strokeWidth={1.6}
                      aria-hidden
                    />
                  }
                  label="Bitcoin via BTCPay"
                  helperText="Available after final review."
                />
              </div>
              <p className="mt-5 rounded-lg border border-linen bg-soft-blue/40 px-4 py-3 text-center text-sm leading-relaxed text-ash">
                Payment options are currently unavailable. Checkout will be
                enabled after final review.
              </p>
            </section>
          </form>

          <aside className="hidden lg:block">
            <div className="sticky top-24 premium-card p-6">
              <CheckoutSummary
                lines={lines}
                subtotal={subtotal}
                estimatedTotal={estimatedTotal}
                shippingDisplay={shippingDisplay}
              />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function CheckoutSummary({
  lines,
  subtotal,
  estimatedTotal,
  shippingDisplay,
}: {
  lines: ReturnType<typeof useCart>["lines"];
  subtotal: number;
  estimatedTotal: number;
  shippingDisplay: ReturnType<typeof useCart>["shippingDisplay"];
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
          <dd className="text-ink">{formatPrice(subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-ash">
          <dt>Shipping</dt>
          <dd
            className={cn(
              "max-w-[12rem] text-right text-xs leading-relaxed",
              shippingDisplay.isFreeShipping && "font-medium text-verified-green"
            )}
          >
            {shippingDisplay.message}
          </dd>
        </div>
        <div className="mt-2 flex justify-between border-t border-linen pt-3">
          <dt className="font-display font-bold text-ink">Estimated total</dt>
          <dd className="font-display text-lg font-bold text-ink">
            {formatPrice(estimatedTotal)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
