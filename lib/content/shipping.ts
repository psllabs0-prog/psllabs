import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import { formatPrice } from "@/lib/cart/format";
import { PRIORITY_BASE_SHIPPING_USD, PRIORITY_DISCOUNTED_SHIPPING_USD } from "@/lib/shipping/policy";
import type { ContentPageMeta, ContentSection } from "./types";
import { PUBLIC_CLAIM_WINDOW_NOTICE } from "./testing-scope";

export const ORDER_PROCESSING_NOTICE =
  "Orders usually process within 24 hours after payment clears. Carrier acceptance or collection may occur on the next operating day.";

export const STANDARD_TRANSIT_NOTICE =
  "USPS Ground Advantage transit is usually 2–5 business days after carrier acceptance for most contiguous U.S. destinations. Alaska and Hawaii can take longer.";

export const PRIORITY_TRANSIT_NOTICE =
  "USPS Priority Mail transit is usually 2–3 business days after carrier acceptance for most contiguous U.S. destinations. Alaska and Hawaii can take longer. Transit estimates are not guaranteed.";

export const PRIORITY_PRICING_NOTICE =
  `When offered at checkout, USPS Priority Mail costs ${formatPrice(PRIORITY_BASE_SHIPPING_USD)} when the product subtotal after discounts is $100 or less, or ${formatPrice(PRIORITY_DISCOUNTED_SHIPPING_USD)} when it is over $100. This threshold excludes tax and shipping charges. Availability depends on your shipping address and parcel. The Priority price replaces Standard shipping; it is not added to the Standard charge.`;

export const shippingPageMeta: ContentPageMeta = {
  label: "SHIPPING",
  title: "Shipping Policy",
  description:
    "Where we ship, processing times, rates, free-shipping threshold, tracking, and what to do if a package is lost or damaged.",
  intro: [
    "PSL Labs ships research materials within the United States. Every order ships with tracking.",
  ],
};

export const shippingSections: ContentSection[] = [
  {
    id: "coverage",
    title: "Where we ship",
    paragraphs: [
      "We ship to physical addresses in all 50 U.S. states from Phoenix, Arizona.",
      "We do not ship internationally at this time, and we do not ship to freight forwarders. If you have address questions, contact support@psllabs.org before ordering.",
    ],
  },
  {
    id: "processing",
    title: "Processing time",
    paragraphs: [
      ORDER_PROCESSING_NOTICE,
      "Processing is separate from carrier transit. The selected service does not promise same-day dispatch or a particular collection cutoff.",
    ],
  },
  {
    id: "delivery-window",
    title: "Delivery timing",
    paragraphs: [
      STANDARD_TRANSIT_NOTICE,
      "Checkout shows the delivery options currently available for your order. If Priority Mail is offered, its usual transit is 2–3 business days after carrier acceptance for most contiguous U.S. destinations; Alaska and Hawaii can take longer.",
      "Carrier timing is an estimate, not a guaranteed delivery date. Weekends, postal holidays, weather and carrier delays can change arrival dates.",
    ],
  },
  {
    id: "rates",
    title: "Shipping rates",
    paragraphs: [
      `Standard USPS Ground Advantage shipping is $${FLAT_SHIPPING_USD.toFixed(2)} on orders with a product subtotal under $${FREE_SHIPPING_THRESHOLD} before discounts.`,
      `Orders with a product subtotal of $${FREE_SHIPPING_THRESHOLD} or more before discounts get free standard U.S. shipping at checkout. Free Standard shipping does not include a Priority upgrade.`,
      PRIORITY_PRICING_NOTICE,
      "Packaging is chosen to protect vial seals and lyophilized material in normal transit.",
    ],
  },
  {
    id: "tracking",
    title: "Tracking",
    paragraphs: [
      "When tracking is saved to your order, we send a shipping email with the tracking number. Creating a label alone does not mean the carrier has received the package.",
      "You can also check status anytime on /track with your email and order number. Carrier scans can take up to 24 hours to appear after label creation.",
    ],
  },
  {
    id: "lost-packages",
    title: "Lost packages",
    paragraphs: [
      "If tracking shows no movement for more than 5 business days, or a package is marked delivered but you cannot find it, email support@psllabs.org with your order number.",
      "We will open a carrier inquiry and explain next steps.",
    ],
  },
  {
    id: "damaged-packages",
    title: "Damaged packages",
    paragraphs: [
      `If packaging or vials arrive damaged, report it promptly. ${PUBLIC_CLAIM_WINDOW_NOTICE}`,
      "Photograph the outer box, label, packing materials, and damaged items. Email support@psllabs.org with your order number and photos.",
      "See /returns for claim details, or contact us through /contact.",
    ],
  },
];
