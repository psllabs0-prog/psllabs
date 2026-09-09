import type { LabIllustrationId } from "@/components/illustrations/lab-illustrations";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { PRODUCT_VIAL_IMAGE } from "@/lib/products/images";

export const heroCopy = {
  eyebrow: "RESEARCH USE ONLY",
  headline: "Research peptides with batch-specific third-party testing.",
  paragraph:
    "PSL Labs sells synthetic peptides for laboratory research. We publish the lab report tied to each available batch so you can review the results yourself. Not for human or veterinary use.",
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
    title: "Reports match the batch",
    description:
      "Each published report is tied to a specific lot, not a generic product claim.",
  },
  {
    illustration: "hplc",
    title: "Original lab files",
    description:
      "You can open the original third-party report and see what the lab measured.",
  },
  {
    illustration: "quality-panel",
    title: "Results you can read",
    description:
      "Published reports show identity, purity, and measured amount for the tested sample.",
  },
  {
    illustration: "us-fulfillment",
    title: "Ships in the U.S.",
    description:
      "Orders ship from Phoenix, AZ with tracking to all 50 states.",
  },
  {
    illustration: "protected-shipping",
    title: "Packed for transit",
    description:
      "We pack vials carefully and send tracking when your label is created.",
  },
  {
    illustration: "research-support",
    title: "Direct support",
    description:
      "Questions about orders or batch docs? Email support@psllabs.org.",
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
    "Lyophilized Retatrutide for laboratory research. Batch report available. Not for human use.",
  price: retatrutideListing.price,
  href: retatrutideListing.href,
  imageSrc: retatrutideListing.imageSrc,
  imageAlt: retatrutideListing.imageAlt,
};
