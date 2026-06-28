import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  FileSearch,
  FlaskConical,
  Globe,
  Microscope,
  PackageCheck,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

import type { NavLink } from "@/lib/navigation";

export const heroCopy = {
  headline: "Research peptides you can trust.",
  subhead:
    "Research peptides with third-party testing and certificate of analysis.",
  ctaLabel: "Shop the Stack",
  ctaHref: "/#shop",
  productImageAlt: "GLP-3 RT research peptide",
  productImageSrc: "/glp-3-rt.png",
};

export type TrustBadgeData = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export const trustBadges: TrustBadgeData[] = [
  {
    icon: FlaskConical,
    title: "99%+ Purity",
    description:
      "Identity and purity verified by HPLC on every batch before release.",
  },
  {
    icon: ShieldCheck,
    title: "Third-Party Tested",
    description:
      "Independent ISO 17025-accredited labs we do not own or operate.",
  },
  {
    icon: PackageCheck,
    title: "Shipment Protection",
    description:
      "Tracked domestic shipping with temperature-stable packaging.",
  },
];

export type WhyChooseCardData = {
  icon: LucideIcon;
  title: string;
  description: string;
  themeColor: "lavender" | "blush" | "mint" | "pale-yellow";
};

export const whyChooseCards: WhyChooseCardData[] = [
  {
    icon: FileSearch,
    title: "Batch-matched COAs",
    description:
      "Every lot ships with a published Certificate of Analysis you can match to your vial label.",
    themeColor: "mint",
  },
  {
    icon: Microscope,
    title: "HPLC identity testing",
    description:
      "Compound identity confirmed against analytical reference standards—not supplier paperwork alone.",
    themeColor: "lavender",
  },
  {
    icon: BadgeCheck,
    title: "Documented quality panels",
    description:
      "Purity, identity, and contaminant results disclosed openly on every batch we release.",
    themeColor: "blush",
  },
  {
    icon: Globe,
    title: "US fulfillment",
    description:
      "Domestic processing and tracked delivery for research supply you can plan around.",
    themeColor: "pale-yellow",
  },
  {
    icon: Truck,
    title: "Protected shipping",
    description:
      "Orders packed for stability in transit with tracking from dispatch to delivery.",
    themeColor: "mint",
  },
  {
    icon: Users,
    title: "Research-first support",
    description:
      "Clear documentation, lot lookup, and direct answers at support@psllabs.com.",
    themeColor: "lavender",
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

export type HomeFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const homeFaqItems: HomeFaqItem[] = [
  {
    id: "research-use",
    question: "Are PSL Labs peptides for human consumption?",
    answer:
      "No. PSL Labs products—including GLP-3 RT—are sold strictly for laboratory and research use only. They are not intended for human or animal consumption, diagnosis, treatment, cure, or prevention of any disease.",
  },
  {
    id: "glp-3-rt",
    question: "What is GLP-3 RT?",
    answer:
      "GLP-3 RT is a research peptide supplied in lyophilized form for in vitro and laboratory research applications. Full compound documentation and batch-specific testing data are published for each lot we release.",
  },
  {
    id: "purity",
    question: "How do you verify purity?",
    answer:
      "Every batch undergoes HPLC identity and purity testing at independent, ISO 17025-accredited third-party laboratories. Results must meet our release specifications before a lot ships.",
  },
  {
    id: "coa",
    question: "Where can I find my Certificate of Analysis?",
    answer:
      "COAs are published on the product page and in our Testing section. Match the lot number on your vial label to the corresponding batch report. If your lot is not yet listed, contact support@psllabs.com.",
  },
  {
    id: "storage",
    question: "How should I store research peptides?",
    answer:
      "Store lyophilized peptides refrigerated or frozen per the product documentation. Reconstituted material should be handled according to your laboratory protocol and stored at recommended temperatures. Avoid repeated freeze-thaw cycles.",
  },
  {
    id: "shipping",
    question: "How does shipping work?",
    answer:
      "We ship within the United States. Orders dispatch within 1–2 business days with tracked delivery. Peptides are packed for stability in transit using temperature-aware materials.",
  },
  {
    id: "returns",
    question: "What is your return policy?",
    answer:
      "Unopened products in original condition may be returned within 30 days of delivery. See our Returns page for eligibility and instructions.",
  },
  {
    id: "payments",
    question: "What payment methods do you accept?",
    answer:
      "Checkout is processed via cryptocurrency through our secure payment partner. You will receive order confirmation and tracking once payment is confirmed.",
  },
];

export const newsletterCopy = {
  heading: "Stay current on batch releases",
  description:
    "New COA publications, restock alerts, and research notes—no marketing noise.",
  placeholder: "you@example.com",
  buttonLabel: "Subscribe",
  disclaimer: "Placeholder — no emails collected yet.",
};

export type FooterColumnData = {
  title: string;
  links: NavLink[];
};

export const footerColumns: FooterColumnData[] = [
  {
    title: "Shop",
    links: [
      { label: "GLP-3 RT", href: "/products/glp-3-rt" },
      { label: "Shop", href: "/#shop" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Science", href: "/science" },
      { label: "Testing", href: "/testing" },
      { label: "Protocol", href: "/protocol" },
      { label: "About", href: "/about" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "FAQ", href: "/faq" },
      { label: "Shipping", href: "/shipping" },
      { label: "Returns", href: "/returns" },
      { label: "Contact", href: "mailto:support@psllabs.com" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export const footerDisclaimer =
  "These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease.";
