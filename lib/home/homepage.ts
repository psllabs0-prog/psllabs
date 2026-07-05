import type { LabIllustrationId } from "@/components/illustrations/lab-illustrations";
import { PRODUCT_VIAL_IMAGE } from "@/lib/products/images";

export const heroCopy = {
  eyebrow: "PSL LABS",
  headline: "Verified research compounds.",
  subheadline: "Third-party tested · batch-matched documentation.",
  ctaLabel: "Shop Products",
  ctaHref: "/products",
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
    title: "Third-party testing",
  },
  {
    illustration: "batch-coa",
    title: "COA documentation",
  },
  {
    illustration: "hplc",
    title: "Batch verification",
  },
];

export type TrustElementData = {
  illustration: LabIllustrationId;
  label: string;
};

export const trustElements: TrustElementData[] = [
  { illustration: "usa-shipping", label: "USA Shipping" },
  { illustration: "third-party-tested", label: "Third-Party Tested" },
  { illustration: "certificate", label: "Certificate of Analysis" },
  { illustration: "research-docs", label: "Research Documentation" },
];

export type WhyChooseCardData = {
  illustration: LabIllustrationId;
  title: string;
  description: string;
};

export const whyChooseCards: WhyChooseCardData[] = [
  {
    illustration: "batch-coa",
    title: "Batch-matched COAs",
    description:
      "Every lot ships with a published Certificate of Analysis you can match to your vial label.",
  },
  {
    illustration: "hplc",
    title: "HPLC identity testing",
    description:
      "Compound identity confirmed against analytical reference standards—not supplier paperwork alone.",
  },
  {
    illustration: "quality-panel",
    title: "Documented quality panels",
    description:
      "Purity, identity, and contaminant results disclosed openly on every batch we release.",
  },
  {
    illustration: "us-fulfillment",
    title: "US fulfillment",
    description:
      "Domestic processing and tracked delivery for research supply you can plan around.",
  },
  {
    illustration: "protected-shipping",
    title: "Protected shipping",
    description:
      "Orders packed for stability in transit with tracking from dispatch to delivery.",
  },
  {
    illustration: "research-support",
    title: "Research-first support",
    description:
      "Clear documentation, lot lookup, and direct answers at support@psllabs.org.",
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

export const featuredProduct: FeaturedProductData = {
  handle: "retatrutide",
  tag: "RESEARCH PEPTIDE",
  name: "Retatrutide",
  description:
    "Lyophilized Retatrutide for laboratory and research use. Batch-specific COA included. Not for human consumption.",
  price: 94,
  href: "/products/retatrutide",
  imageSrc: PRODUCT_VIAL_IMAGE.src,
  imageAlt: PRODUCT_VIAL_IMAGE.alt,
};
