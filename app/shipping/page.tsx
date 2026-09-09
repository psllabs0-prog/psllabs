import type { Metadata } from "next";
import Link from "next/link";

import { AnimateIn } from "@/components/product/animate-in";
import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import { shippingPageMeta, shippingSections } from "@/lib/content/shipping";
import { PUBLIC_CLAIM_WINDOW_NOTICE } from "@/lib/content/testing-scope";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Shipping Policy",
  description: shippingPageMeta.description,
  path: "/shipping",
});

export default function ShippingPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-[760px] px-6 py-16 md:px-12 md:py-20 lg:px-24 lg:py-24">
        <header className="mb-12 border-b border-linen pb-10 md:mb-14 md:pb-12">
          <AnimateIn>
            <p className="mono text-ash">{shippingPageMeta.label}</p>
          </AnimateIn>
          <AnimateIn delay={0.06}>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-ink">
              {shippingPageMeta.title}
            </h1>
          </AnimateIn>
          {shippingPageMeta.intro?.map((paragraph, index) => (
            <AnimateIn key={index} delay={0.1 + index * 0.04}>
              <p className="mt-5 text-base leading-relaxed text-ash md:text-[1.0625rem]">
                {paragraph}
              </p>
            </AnimateIn>
          ))}
        </header>

        <div className="flex flex-col gap-10 md:gap-12 text-base leading-relaxed text-ink md:text-[1.0625rem]">
          {/* 1. Destination Coverage */}
          <AnimateIn delay={0.12}>
            <section className="flex flex-col gap-3 rounded-xl border border-linen bg-surface p-6 md:p-8">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                1. Destination Coverage
              </h2>
              <p className="text-ash">
                PSL Labs ships exclusively to physical addresses within the 50 United States. All orders are fulfilled domestically from Phoenix, Arizona.
              </p>
              <p className="text-ash">
                We do not ship internationally, to U.S. territories at this time, or to third-party freight forwarders. Orders must have a valid domestic U.S. delivery address serviceable by standard carriers (USPS / UPS). If you have address verification questions, please{" "}
                <Link href="/contact" className="font-medium text-accent underline underline-offset-4 hover:opacity-80">
                  contact our support team
                </Link>{" "}
                before completing checkout.
              </p>
            </section>
          </AnimateIn>

          {/* 2. Order Processing Window */}
          <AnimateIn delay={0.16}>
            <section className="flex flex-col gap-3 rounded-xl border border-linen bg-surface p-6 md:p-8">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                2. Order Processing Window
              </h2>
              <p className="text-ash">
                Orders are processed and packaged within <strong>1–2 business days</strong> (Monday through Friday, excluding U.S. federal postal holidays) following verified payment receipt.
              </p>
              <p className="text-ash">
                Orders placed over the weekend or on postal holidays enter the fulfillment queue on the following business day. Once your materials are verified and boxed, the carrier shipping label is generated immediately.
              </p>
            </section>
          </AnimateIn>

          {/* 3. Estimated Carrier Delivery Window */}
          <AnimateIn delay={0.2}>
            <section className="flex flex-col gap-3 rounded-xl border border-linen bg-surface p-6 md:p-8">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                3. Estimated Carrier Delivery Window
              </h2>
              <p className="text-ash">
                Standard domestic transit typically requires <strong>3–5 business days</strong> from carrier acceptance to delivery, depending on regional proximity to our Arizona fulfillment location.
              </p>
              <p className="text-ash">
                <em>Important transit disclaimer:</em> Delivery timeframes are carrier estimates and not operational delivery date guarantees. PSL Labs operations cannot guarantee delivery by a specific calendar day because carrier transit times remain subject to weather disruptions, carrier volume surges, and local route delays.
              </p>
            </section>
          </AnimateIn>

          {/* 4. Tracking Policy */}
          <AnimateIn delay={0.24}>
            <section className="flex flex-col gap-3 rounded-xl border border-linen bg-surface p-6 md:p-8">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                4. Tracking Policy
              </h2>
              <p className="text-ash">
                Every shipment is assigned a unique postal tracking number. An automated shipping confirmation email containing your direct tracking link is dispatched immediately upon label creation.
              </p>
              <p className="text-ash">
                You can also review order status and active carrier tracking anytime via our self-service{" "}
                <Link href="/track" className="font-medium text-accent underline underline-offset-4 hover:opacity-80">
                  Track Order page
                </Link>{" "}
                by providing your order number and the email address used at checkout. Please allow up to 24 hours after label creation for carrier scan events to update in the carrier system.
              </p>
            </section>
          </AnimateIn>

          {/* 5. Shipping Charges & Free Shipping Threshold */}
          <AnimateIn delay={0.28}>
            <section className="flex flex-col gap-3 rounded-xl border border-linen bg-surface p-6 md:p-8">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                5. Shipping Charges & Free Shipping Threshold
              </h2>
              <p className="text-ash">
                Standard domestic shipping is billed at a flat rate of <strong>${FLAT_SHIPPING_USD.toFixed(2)}</strong> for all orders under ${FREE_SHIPPING_THRESHOLD}.
              </p>
              <p className="text-ash">
                <strong>Free U.S. Shipping:</strong> Orders with a product subtotal of <strong>${FREE_SHIPPING_THRESHOLD} or greater</strong> automatically qualify for free standard domestic shipping. The free shipping credit is computed and applied dynamically at checkout prior to final payment submission.
              </p>
              <p className="text-ash">
                Packaging materials are selected to protect compound vial integrity and vial seals during normal domestic transit conditions.
              </p>
            </section>
          </AnimateIn>

          {/* 6. Lost-Package Procedure */}
          <AnimateIn delay={0.32}>
            <section className="flex flex-col gap-3 rounded-xl border border-linen bg-surface p-6 md:p-8">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                6. Lost-Package Procedure
              </h2>
              <p className="text-ash">
                If your tracking number shows no movement for more than 5 consecutive business days, or if the carrier marks a package delivered but it has not been received, please take the following steps:
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-ash">
                <li>Check with immediate building reception, mailrooms, or perimeter delivery points.</li>
                <li>
                  Email <a href="mailto:support@psllabs.org" className="font-medium text-accent underline underline-offset-4">support@psllabs.org</a> with your order number and verified shipping address.
                </li>
                <li>Our fulfillment team will open an official trace inquiry with the carrier to verify coordinates and locate the shipment.</li>
              </ol>
            </section>
          </AnimateIn>

          {/* 7. Damaged-Package Procedure */}
          <AnimateIn delay={0.36}>
            <section className="flex flex-col gap-3 rounded-xl border border-linen bg-surface p-6 md:p-8">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-ink md:text-2xl">
                7. Damaged-Package Procedure
              </h2>
              <p className="text-ash">
                If an order arrives with damaged outer packaging, compromised vials, or discrepancies, report the issue promptly upon delivery. {PUBLIC_CLAIM_WINDOW_NOTICE}
              </p>
              <p className="text-ash">
                To report transit damage:
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-ash">
                <li>Photograph the exterior shipping parcel, label, internal protective packaging, and affected items.</li>
                <li>Preserve all packaging materials and contents in their original state.</li>
                <li>
                  Submit the photographs, your order number, and description to{" "}
                  <a href="mailto:support@psllabs.org" className="font-medium text-accent underline underline-offset-4">
                    support@psllabs.org
                  </a>{" "}
                  or via our{" "}
                  <Link href="/contact" className="font-medium text-accent underline underline-offset-4 hover:opacity-80">
                    Contact page
                  </Link>.
                </li>
              </ul>
              <p className="mt-2 text-ash">
                Detailed eligibility criteria and replacement terms are outlined in our{" "}
                <Link href="/returns" className="font-medium text-accent underline underline-offset-4 hover:opacity-80">
                  Returns & Refunds Policy
                </Link>.
              </p>
            </section>
          </AnimateIn>
        </div>
      </div>
    </main>
  );
}
