import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import type { ContentPageMeta, ContentSection } from "./types";
import { PUBLIC_CLAIM_WINDOW_NOTICE } from "./testing-scope";

export const shippingPageMeta: ContentPageMeta = {
  label: "FULFILLMENT & SHIPPING",
  title: "Shipping Policy",
  description:
    "Operationally verified shipping details: domestic U.S. coverage, processing times, carrier transit, flat rates, and lost or damaged package procedures.",
  intro: [
    "PSL Labs ships research materials domestically within the United States. All orders are packed and dispatched with tracking to support laboratory verification workflows.",
  ],
};

export const shippingSections: ContentSection[] = [
  {
    id: "coverage",
    title: "Destination Coverage",
    paragraphs: [
      "We currently ship exclusively to physical addresses across all 50 U.S. states.",
      "We do not offer international shipping at this time. Standard carrier-accessible domestic addresses are supported. We do not ship to freight forwarders or international reshippers. If you have questions regarding address verification, contact support@psllabs.org prior to placing an order.",
    ],
  },
  {
    id: "processing",
    title: "Order Processing Window",
    paragraphs: [
      "Orders are processed and prepared for carrier pickup within 1–2 business days (Monday through Friday, excluding U.S. federal postal holidays) following payment confirmation.",
      "Orders placed over weekends or during scheduled holiday closures begin processing on the next standard business day.",
    ],
  },
  {
    id: "delivery-window",
    title: "Estimated Carrier Delivery Window",
    paragraphs: [
      "Standard domestic transit typically takes 3–5 business days following carrier acceptance, depending on geographical distance from our fulfillment hub in Phoenix, AZ.",
      "Please note that carrier delivery windows are estimates provided by postal services and are not operational delivery guarantees. Transit times may vary due to severe weather, regional logistics surges, or carrier route disruptions.",
    ],
  },
  {
    id: "rates",
    title: `Shipping Rates & Free Shipping Threshold`,
    paragraphs: [
      `Standard domestic shipping is a flat rate of $${FLAT_SHIPPING_USD.toFixed(2)} on all orders below $${FREE_SHIPPING_THRESHOLD}.`,
      `Free standard U.S. shipping is automatically applied at checkout on all orders with a product subtotal of $${FREE_SHIPPING_THRESHOLD} or greater.`,
      "Shipping fees cover secure packaging materials designed to maintain physical compound integrity during normal transit.",
    ],
  },
  {
    id: "tracking",
    title: "Tracking Policy",
    paragraphs: [
      "An automated shipping confirmation email containing your official tracking number is sent as soon as your shipping label is generated.",
      "You can also check real-time order status, carrier tracking, and line items at any time on our Track Order page (/track) using your email and order number.",
      "Carrier tracking updates may take up to 24 hours to populate on carrier scanning systems after label creation.",
    ],
  },
  {
    id: "lost-packages",
    title: "Lost Package Procedure",
    paragraphs: [
      "If your tracking number shows no movement for more than 5 consecutive business days, or if a package is marked delivered by the carrier but cannot be located, contact support@psllabs.org with your order number.",
      "We will initiate an inquiry with the carrier to investigate the status and determine appropriate next steps.",
    ],
  },
  {
    id: "damaged-packages",
    title: "Damaged Package Procedure",
    paragraphs: [
      `If an order arrives with damaged outer packaging, damaged vials, or missing materials, report the issue promptly. ${PUBLIC_CLAIM_WINDOW_NOTICE}`,
      "To submit a damage claim, take clear photographs of the outer shipping box, shipping label, internal packaging, and damaged items. Email support@psllabs.org with your order number and photo documentation.",
      "For details on claim eligibility and resolution procedures, refer to our Returns Policy (/returns) or reach out directly via our Contact page (/contact).",
    ],
  },
];
