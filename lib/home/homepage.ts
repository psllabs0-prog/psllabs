import type { LabIllustrationId } from "@/components/illustrations/lab-illustrations";
import { TESTING_SCOPE_STATEMENT } from "@/lib/content/testing-scope";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { PRODUCT_VIAL_IMAGE } from "@/lib/products/images";

export const heroCopy = {
  eyebrow: "PSL LABS",
  headline: "Verified research compounds.",
  subheadline:
    "Independent batch documentation for selected lots · laboratory reports when published.",
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
    title: "Laboratory reports",
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
  { illustration: "third-party-tested", label: "Laboratory Reports" },
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
    title: "Batch-matched reports",
    description:
      "Independent batch documentation available for selected lots.",
  },
  {
    illustration: "hplc",
    title: "Original laboratory reports",
    description: TESTING_SCOPE_STATEMENT,
  },
  {
    illustration: "quality-panel",
    title: "Published lot documentation",
    description:
      "Identity and purity results are disclosed on published lot-specific reports when testing documentation is available.",
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

const retatrutideListing = getCatalogProductByHandle("retatrutide")!;

export const featuredProduct: FeaturedProductData = {
  handle: retatrutideListing.handle,
  tag: retatrutideListing.tag,
  name: retatrutideListing.name,
  description:
    "Lyophilized Retatrutide for laboratory and research use. Independent batch documentation available for selected lots. Not for human consumption.",
  price: retatrutideListing.price,
  href: retatrutideListing.href,
  imageSrc: retatrutideListing.imageSrc,
  imageAlt: retatrutideListing.imageAlt,
};
