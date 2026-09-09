import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import type { ContentPageMeta, ContentSection } from "./types";
import { PUBLIC_CLAIM_WINDOW_NOTICE } from "./testing-scope";

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
      "Orders usually pack and ship within 1 to 2 business days (Monday through Friday, excluding U.S. federal postal holidays) after payment clears.",
      "Weekend and holiday orders enter the queue on the next business day.",
    ],
  },
  {
    id: "delivery-window",
    title: "Delivery timing",
    paragraphs: [
      "After the carrier accepts the package, standard domestic transit usually takes about 3 to 5 business days, depending on distance from Arizona.",
      "Carrier timing is an estimate, not a guaranteed delivery date. Weather and carrier delays can change transit times.",
    ],
  },
  {
    id: "rates",
    title: "Shipping rates",
    paragraphs: [
      `Standard domestic shipping is $${FLAT_SHIPPING_USD.toFixed(2)} on orders under $${FREE_SHIPPING_THRESHOLD}.`,
      `Orders with a product subtotal of $${FREE_SHIPPING_THRESHOLD} or more get free standard U.S. shipping at checkout.`,
      "Packaging is chosen to protect vial seals and lyophilized material in normal transit.",
    ],
  },
  {
    id: "tracking",
    title: "Tracking",
    paragraphs: [
      "When your label is created, you get a shipping email with the tracking number.",
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
