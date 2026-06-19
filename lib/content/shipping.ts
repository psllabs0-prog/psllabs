import type { ContentPageMeta, ContentSection } from "./types";

export const shippingPageMeta: ContentPageMeta = {
  label: "SHIPPING",
  title: "Shipping",
  description: "Where we ship, how fast, and what it costs.",
  intro: [
    "We ship from the United States. Orders are packed within 1–2 business days of confirmation.",
  ],
};

export const shippingSections: ContentSection[] = [
  {
    id: "regions",
    title: "Where we ship",
    paragraphs: [
      "We currently ship to all 50 US states. We do not ship internationally, to PO boxes requiring special handling beyond standard USPS/UPS service, or to US territories at launch—contact support if you need clarification for your address.",
    ],
  },
  {
    id: "timing",
    title: "Processing and delivery times",
    paragraphs: [
      "Orders are processed within 1–2 business days (Monday–Friday, excluding holidays). Standard delivery is 3–7 business days after shipment depending on your location.",
      "You will receive a tracking number by email when your order ships.",
    ],
  },
  {
    id: "rates",
    title: "Shipping rates",
    paragraphs: [
      "Standard shipping is calculated at checkout based on weight and destination. Free standard shipping applies to US orders over $60 before tax.",
      "Expedited shipping may be available at checkout for an additional fee.",
    ],
  },
  {
    id: "subscriptions",
    title: "Subscription shipments",
    paragraphs: [
      "Subscription orders ship automatically on your renewal date. You will receive tracking for each shipment. Update your address in your account before your next renewal to avoid delivery to an old address.",
    ],
  },
  {
    id: "issues",
    title: "Lost or damaged packages",
    paragraphs: [
      "If your package is lost or arrives damaged, contact support@psllabs.com within 14 days of the estimated delivery date with your order number and photos (if damaged). We will work with the carrier to resolve the issue.",
    ],
  },
];
