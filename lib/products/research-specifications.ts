import type { Product, ProductSpecification } from "./types";

type ChemicalReference = {
  cas: string;
  molecularWeight: string;
  basis: string;
  sources: readonly { title: string; href: string }[];
};

/** Database reference species, never an assertion of the supplied salt/form. */
export const chemicalReferences: Readonly<Record<string, ChemicalReference>> = {
  retatrutide: {
    cas: "2381089-83-2 (reference compound)",
    molecularWeight: "Approximately 4,731 g/mol (formula-based database reference)",
    basis: "Structural reference formula C221H342N46O68. The database record's salt naming and formula differ; this figure is not a verified supplied sodium-salt mass.",
    sources: [
      { title: "NCATS GSRS compound registration", href: "https://gsrs.ncats.nih.gov/ginas/app/ui/substances/NOP2Y096GV" },
      { title: "PubChem structural reference, CID 171934787", href: "https://pubchem.ncbi.nlm.nih.gov/compound/171934787" },
    ],
  },
  "ghk-cu": {
    cas: "89030-95-5 (reference species)",
    molecularWeight: "402.92 g/mol (Prezatide copper reference species)",
    basis: "Positively charged 1:1 copper–peptide reference species, C14H23CuN6O4+. Other representations and complexes have different molecular weights; supplied composition is not established by the published report.",
    sources: [{ title: "PubChem Prezatide copper, CID 71587328", href: "https://pubchem.ncbi.nlm.nih.gov/compound/71587328" }],
  },
  "bpc-157": {
    cas: "137525-51-0 (reference peptide)",
    molecularWeight: "1,419.5 g/mol (reference peptide, excluding counterions and solvates)",
    basis: "Reference peptide formula C62H98N16O22. Supplied salt, counterion and hydration state have not been established by the published report.",
    sources: [{ title: "PubChem BPC-157 reference", href: "https://pubchem.ncbi.nlm.nih.gov/compound/BPC157" }],
  },
  tesamorelin: {
    cas: "218949-48-5 (reference free base)",
    molecularWeight: "5,135.9 g/mol (reference free-base basis)",
    basis: "Reference free base only. An acetate or other supplied salt has a different formula and mass; the published report does not establish that supplied form.",
    sources: [
      { title: "PubChem Tesamorelin reference", href: "https://pubchem.ncbi.nlm.nih.gov/compound/Tesamorelin" },
      { title: "FDA chemistry review: free-base molecular weight", href: "https://www.accessdata.fda.gov/drugsatfda_docs/nda/2010/022505Orig1s000ChemR.pdf" },
    ],
  },
  "reconstitution-solution": {
    cas: "Not applicable to the whole product: aqueous mixture",
    molecularWeight: "Not applicable to the whole product: mixture, not a single molecule",
    basis: "Component reference data: water, CAS 7732-18-5, 18.015 g/mol; benzyl alcohol, CAS 100-51-6, 108.14 g/mol. The batch report measures benzyl alcohol concentration; it does not report a purity percentage or establish sterility.",
    sources: [
      { title: "PubChem water reference", href: "https://pubchem.ncbi.nlm.nih.gov/compound/Water" },
      { title: "PubChem benzyl alcohol reference", href: "https://pubchem.ncbi.nlm.nih.gov/compound/benzyl_alcohol" },
    ],
  },
};

export const CHEMICAL_REFERENCE_SCOPE =
  "Chemical reference information is separate from measured batch results. Supplied-form molecular weight, counterions and hydration state are not established by the published batch report. Refer to the original report for the sample identity, amount and tests actually performed.";

export function getResearchSpecifications(product: Product): ProductSpecification[] {
  const existing = product.specifications ?? [];
  const reference = chemicalReferences[product.handle];
  if (!reference) return existing;
  const storage = product.howToUse.find((step) => step.title === "Storage")?.description;
  return [
    ...existing.filter((row) => !/^CAS(?: number)?$/i.test(row.label)),
    { label: "CAS number — chemical reference", value: reference.cas },
    { label: "Molecular weight — chemical reference", value: reference.molecularWeight },
    { label: "Reference form and limits", value: reference.basis },
    ...(storage ? [{ label: "Laboratory storage guidance", value: `${storage} No batch-specific shelf-life or stability validation is published.` }] : []),
    ...(product.handle === "reconstitution-solution" ? [{ label: "Purity", value: "No purity percentage reported. See the original report for the measured benzyl alcohol concentration." }] : []),
  ];
}
