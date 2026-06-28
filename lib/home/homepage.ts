import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  FileSearch,
  FileText,
  FlaskConical,
  Globe,
  Microscope,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

export const heroCopy = {
  headlineLines: [
    "Research Compounds.",
    "Verified Purity.",
    "Third-Party Tested.",
  ],
  ctaLabel: "Shop Products",
  ctaHref: "/products",
  productImageAlt: "GLP-3 RT research peptide",
  productImageSrc: "/glp-3-rt.png",
};

export type TrustElementData = {
  icon: LucideIcon;
  label: string;
};

export const trustElements: TrustElementData[] = [
  { icon: Truck, label: "USA Shipping" },
  { icon: ShieldCheck, label: "Third-Party Tested" },
  { icon: FlaskConical, label: "Certificate of Analysis" },
  { icon: FileText, label: "Research Documentation" },
];

export type WhyChooseCardData = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export const whyChooseCards: WhyChooseCardData[] = [
  {
    icon: FileSearch,
    title: "Batch-matched COAs",
    description:
      "Every lot ships with a published Certificate of Analysis you can match to your vial label.",
  },
  {
    icon: Microscope,
    title: "HPLC identity testing",
    description:
      "Compound identity confirmed against analytical reference standards—not supplier paperwork alone.",
  },
  {
    icon: BadgeCheck,
    title: "Documented quality panels",
    description:
      "Purity, identity, and contaminant results disclosed openly on every batch we release.",
  },
  {
    icon: Globe,
    title: "US fulfillment",
    description:
      "Domestic processing and tracked delivery for research supply you can plan around.",
  },
  {
    icon: Truck,
    title: "Protected shipping",
    description:
      "Orders packed for stability in transit with tracking from dispatch to delivery.",
  },
  {
    icon: Users,
    title: "Research-first support",
    description:
      "Clear documentation, lot lookup, and direct answers at support@psllabs.com.",
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
  handle: "glp-3-rt",
  tag: "RESEARCH PEPTIDE",
  name: "GLP-3 RT",
  description:
    "Lyophilized GLP-3 RT for laboratory and research use. Batch-specific COA included. Not for human consumption.",
  price: 94,
  href: "/products/glp-3-rt",
  imageSrc: "/glp-3-rt.png",
  imageAlt: "GLP-3 RT research peptide vial",
};

export const newsletterCopy = {
  heading: "Stay current on batch releases",
  description:
    "New COA publications, restock alerts, and research notes—no marketing noise.",
  placeholder: "you@example.com",
  buttonLabel: "Subscribe",
  disclaimer: "Placeholder — no emails collected yet.",
};
