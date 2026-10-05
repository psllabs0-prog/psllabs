import type { LabIllustrationId } from "@/components/illustrations/lab-illustrations";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { PRODUCT_VIAL_IMAGE } from "@/lib/products/images";

export const heroCopy = {
  eyebrow: "PSL LABS · PHOENIX, ARIZONA",
  headline: "Research peptides. Know your batch.",
  paragraph:
    "Check the available stock and order directly from PSL Labs. Open the published batch reports and see what the lab measured before you buy.",
  primaryCtaLabel: "Browse Products",
  primaryCtaHref: "/products",
  secondaryCtaLabel: "View Batch Reports",
  secondaryCtaHref: "/coa",
  productImageAlt: PRODUCT_VIAL_IMAGE.alt,
  productImageSrc: PRODUCT_VIAL_IMAGE.src,
};

export type HeroTrustCardData = {
  illustration: LabIllustrationId;
  title: string;
};

export const heroTrustCards: HeroTrustCardData[] = [
  {
    illustration: "third-party-tested",
    title: "Lab reports",
  },
  {
    illustration: "batch-coa",
    title: "Batch COAs",
  },
  {
    illustration: "hplc",
    title: "Checkable results",
  },
];

export type TrustElementData = {
  illustration: LabIllustrationId;
  label: string;
};

export const trustElements: TrustElementData[] = [
  { illustration: "usa-shipping", label: "USA Shipping" },
  { illustration: "third-party-tested", label: "Lab Reports" },
  { illustration: "certificate", label: "Certificate of Analysis" },
  { illustration: "research-docs", label: "Batch Documentation" },
];

export type WhyChooseCardData = {
  illustration: LabIllustrationId;
  title: string;
  description: string;
};

export const whyChooseCards: WhyChooseCardData[] = [
  {
    illustration: "batch-coa",
    title: "Check the batch before you buy",
    description:
      "Open the original third-party report and match it to the lot. The report shows exactly what the lab tested and measured.",
  },
  {
    illustration: "us-fulfillment",
    title: "Shipped from Phoenix",
    description:
      "We ship to all 50 states and send tracking when your label is created. Shipping costs and timing are listed before checkout.",
  },
  {
    illustration: "research-support",
    title: "A place to ask questions",
    description:
      "Need help with an order or a batch report? Email support@psllabs.org and tell us what you need.",
  },
];

export type FeaturedProductData = {
  handle: string;
  tag: string;
  name: string;
  description: string;
  price: number;
  href: string;
  imageSrc: string;
  imageAlt: string;
};

const retatrutideListing = getCatalogProductByHandle("retatrutide")!;

export const featuredProduct: FeaturedProductData = {
  handle: retatrutideListing.handle,
  tag: retatrutideListing.tag,
  name: retatrutideListing.name,
  description:
    "Freeze dried Retatrutide for laboratory research. Batch report available. Not for human use.",
  price: retatrutideListing.price,
  href: retatrutideListing.href,
  imageSrc: retatrutideListing.imageSrc,
  imageAlt: retatrutideListing.imageAlt,
};
