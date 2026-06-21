import type { LucideIcon } from "lucide-react";
import { FileCheck, FlaskConical, ShieldCheck, Truck } from "lucide-react";

import type { ProductThemeColor } from "@/components/ui/product-card";

export type HomeCarouselProduct = {
  handle: string;
  tag: string;
  name: string;
  shortDescription: string;
  price: number;
  subscribePrice: number;
  href: string;
  themeColor: ProductThemeColor;
};

export const homeCarouselProducts: HomeCarouselProduct[] = [
  {
    handle: "foundation",
    tag: "FOUNDATION · DAILY",
    name: "Foundation",
    shortDescription:
      "The base layer. Trans-resveratrol, spermidine, fisetin, and methylated B-complex.",
    price: 52,
    subscribePrice: 44,
    href: "/products/foundation",
    themeColor: "lavender",
  },
  {
    handle: "cellular-energy",
    tag: "CELLULAR ENERGY · NAD+",
    name: "Cellular Energy",
    shortDescription:
      "NMN and NR with TMG for methylation support. Targets NAD+ decline.",
    price: 68,
    subscribePrice: 58,
    href: "/products/cellular-energy",
    themeColor: "blush",
  },
  {
    handle: "recovery",
    tag: "RECOVERY · MITOCHONDRIA",
    name: "Recovery",
    shortDescription:
      "Urolithin A, ubiquinol, and PQQ. The mitochondrial biogenesis stack.",
    price: 84,
    subscribePrice: 72,
    href: "/products/recovery",
    themeColor: "mint",
  },
];

export type TrustGuarantee = {
  icon: LucideIcon;
  title: string;
  description: string;
  themeColor: ProductThemeColor;
};

export const trustGuarantees: TrustGuarantee[] = [
  {
    icon: ShieldCheck,
    title: "Third-party verified",
    description:
      "Every batch tested by ISO 17025-accredited labs we do not own. Full COAs published for every lot.",
    themeColor: "mint",
  },
  {
    icon: FlaskConical,
    title: "Clinical-grade dosing",
    description:
      "Actives at the dose ranges used in published research—not proprietary blends at fraction-of-study amounts.",
    themeColor: "lavender",
  },
  {
    icon: FileCheck,
    title: "Full transparency",
    description:
      "Ingredient identity, potency, and contaminant panels disclosed openly. No marketing PDFs in place of data.",
    themeColor: "blush",
  },
  {
    icon: Truck,
    title: "Shipped with care",
    description:
      "Temperature-stable packaging, tracked delivery, and batch-matched documentation in every order.",
    themeColor: "pale-yellow",
  },
];

export type QualityTab = {
  id: string;
  label: string;
  title: string;
  summary: string;
  details: string[];
};

export const qualityTabs: QualityTab[] = [
  {
    id: "identity",
    label: "Identity",
    title: "Verified compound identity",
    summary:
      "HPLC against reference standards confirms each active is exactly what the label claims—before any potency or contaminant testing runs.",
    details: [
      "HPLC fingerprint matched to USP or analytical reference standards",
      "Batch-specific lot numbers traceable from bottle to COA",
      "Failed identity tests halt release—no exceptions",
    ],
  },
  {
    id: "potency",
    label: "Potency",
    title: "Label-claim potency",
    summary:
      "We verify actives meet label claim within established tolerance. Under-dosed batches do not ship.",
    details: [
      "Quantitative assays for every listed active ingredient",
      "Specifications set against published research dose ranges",
      "Stability data reviewed at batch release",
    ],
  },
  {
    id: "contaminants",
    label: "Contaminants",
    title: "Heavy metals & microbial limits",
    summary:
      "Independent panels for heavy metals and microbial limits per USP guidelines—because purity is more than identity alone.",
    details: [
      "Lead, arsenic, cadmium, mercury via ICP-MS",
      "Total plate count, yeast, mold, and pathogen screening",
      "cGMP manufacturing with annual partner audits",
    ],
  },
  {
    id: "coa",
    label: "COA access",
    title: "Certificates you can read",
    summary:
      "Every lot ships with a published Certificate of Analysis listing methods, results, and pass/fail against our specs.",
    details: [
      "Lot number printed on every bottle label",
      "COAs live on product pages within 48 hours of release",
      "Contact support@psllabs.com for unpublished lots",
    ],
  },
];
