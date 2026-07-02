export type CatalogSpecification = {
  label: string;
  value: string;
};

export type CatalogProduct = {
  handle: string;
  tag: string;
  name: string;
  description: string;
  price: number;
  href: string;
  imageSrc: string;
  imageAlt: string;
  purityBadge: string;
  specifications: CatalogSpecification[];
  testingSummary: string;
};

export const catalogProducts: CatalogProduct[] = [
  {
    handle: "retatrutide",
    tag: "RESEARCH PEPTIDE",
    name: "Retatrutide",
    description:
      "Lyophilized research peptide for laboratory and in vitro use. Every batch is identity-verified by independent HPLC with a published Certificate of Analysis matched to your vial lot number.",
    price: 94,
    href: "/products/retatrutide",
    imageSrc: "/Retatrutide.png",
    imageAlt: "Retatrutide research peptide vial",
    purityBadge: "99%+ HPLC Verified",
    specifications: [
      { label: "Form", value: "Lyophilized powder" },
      { label: "Purity", value: "≥99% by HPLC" },
      { label: "Identity", value: "Reference-standard confirmed" },
      { label: "Testing", value: "Third-party ISO 17025 lab" },
      { label: "Documentation", value: "Batch-matched COA" },
      { label: "Intended use", value: "Laboratory research only" },
    ],
    testingSummary:
      "Identity, purity, and contaminant panels run on every lot before release. COA published within 48 hours of batch release.",
  },
];

export function getCatalogProducts(): CatalogProduct[] {
  return catalogProducts;
}
