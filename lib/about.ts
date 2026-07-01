import type { LabIllustrationId } from "@/components/illustrations/lab-illustrations";

export type LabPhoto = {
  id: string;
  variant: "vial" | "hplc" | "documentation" | "quality";
  caption: string;
  alt: string;
};

export type MissionPrinciple = {
  title: string;
  description: string;
};

export type ProcessStep = {
  step: number;
  title: string;
  description: string;
};

export type TestingStandard = {
  title: string;
  description: string;
  illustrationId: LabIllustrationId;
};

export type TimelineEvent = {
  phase: string;
  title: string;
  description: string;
};

export type AboutContent = {
  hero: {
    label: string;
    headline: string;
    intro: string;
  };
  mission: {
    label: string;
    title: string;
    paragraphs: string[];
    principles: MissionPrinciple[];
  };
  labPhotos: LabPhoto[];
  researchProcess: {
    label: string;
    title: string;
    intro: string;
    steps: ProcessStep[];
  };
  testingStandards: {
    label: string;
    title: string;
    intro: string;
    standards: TestingStandard[];
  };
  timeline: {
    label: string;
    title: string;
    intro: string;
    events: TimelineEvent[];
  };
};

export const aboutContent: AboutContent = {
  hero: {
    label: "ABOUT PSL LABS",
    headline: "Research supply built on documentation—not marketing.",
    intro:
      "We exist for laboratories and researchers who need compounds they can verify. Every batch is independently tested, documented, and released against published specifications—for research use only.",
  },
  mission: {
    label: "OUR MISSION",
    title: "Make verification the default in research supply.",
    paragraphs: [
      "Most suppliers ask you to trust a label. We ask you to read a COA. PSL Labs was founded on a simple premise: researchers deserve the same rigor in their supply chain that they apply in their protocols.",
      "We source research-grade compounds, require third-party verification on every lot, and publish batch-matched documentation before release. No shortcuts, no marketing-first positioning—just compounds you can audit.",
    ],
    principles: [
      {
        title: "Transparency over claims",
        description:
          "Full Certificates of Analysis published per lot—not summaries, not selective data.",
      },
      {
        title: "Independence over convenience",
        description:
          "Testing performed by ISO 17025-accredited laboratories we do not own or control.",
      },
      {
        title: "Documentation over trust",
        description:
          "Match your vial lot number to published records before use in any workflow.",
      },
    ],
  },
  labPhotos: [
    {
      id: "vial-release",
      variant: "vial",
      caption: "Batch release — identity-verified research peptide",
      alt: "Retatrutide research peptide vial on laboratory surface",
    },
    {
      id: "hplc-analysis",
      variant: "hplc",
      caption: "HPLC verification against reference standards",
      alt: "HPLC chromatography analysis illustration",
    },
    {
      id: "coa-documentation",
      variant: "documentation",
      caption: "Batch-matched Certificate of Analysis",
      alt: "Certificate of Analysis documentation",
    },
    {
      id: "quality-review",
      variant: "quality",
      caption: "Release review against published specifications",
      alt: "Quality control panel review",
    },
  ],
  researchProcess: {
    label: "RESEARCH PROCESS",
    title: "From sourcing to release—every step documented.",
    intro:
      "Our workflow is designed around reproducibility. Each lot moves through a defined sequence of qualification, independent testing, and documentation before it reaches your laboratory.",
    steps: [
      {
        step: 1,
        title: "Source & qualify",
        description:
          "Manufacturing partners are vetted for cGMP registration, batch record practices, and alignment with our release specifications before any compound is listed.",
      },
      {
        step: 2,
        title: "Incoming lot control",
        description:
          "Every shipment is logged with lot number, chain of custody, and storage conditions. Nothing enters inventory without complete manufacturing documentation.",
      },
      {
        step: 3,
        title: "Third-party analysis",
        description:
          "Independent ISO 17025 laboratories run identity (HPLC), purity, heavy metal, and microbial panels. We do not accept supplier-only test results.",
      },
      {
        step: 4,
        title: "Release review",
        description:
          "Results are reviewed against our published specifications. Batches that do not meet documented criteria are not released for sale.",
      },
      {
        step: 5,
        title: "Publish & fulfill",
        description:
          "COAs are published within 48 hours of batch release. Your vial lot number maps directly to the report on the product page.",
      },
    ],
  },
  testingStandards: {
    label: "TESTING STANDARDS",
    title: "What every batch must pass.",
    intro:
      "Our release criteria mirror what serious laboratories expect: confirmed identity, verified purity, and contaminant panels run by a lab we don't own.",
    standards: [
      {
        title: "Identity — HPLC",
        description:
          "Each compound is verified against reference standards by high-performance liquid chromatography. Wrong identity means no release.",
        illustrationId: "hplc",
      },
      {
        title: "Purity ≥99%",
        description:
          "Purity is quantified by HPLC with documented method and acceptance criteria. Results appear on your batch-specific COA.",
        illustrationId: "third-party-tested",
      },
      {
        title: "Heavy metals — ICP-MS",
        description:
          "Lead, arsenic, cadmium, and mercury screened via inductively coupled plasma mass spectrometry per established limits.",
        illustrationId: "quality-panel",
      },
      {
        title: "Microbial limits",
        description:
          "Total plate count, yeast and mold, and pathogen screening aligned with USP guidelines for research-grade materials.",
        illustrationId: "third-party-tested",
      },
      {
        title: "Batch-matched COA",
        description:
          "Every vial ships with a lot number tied to a published Certificate of Analysis—full results, not marketing summaries.",
        illustrationId: "batch-coa",
      },
      {
        title: "Research documentation",
        description:
          "Compound specifications, storage guidance, and SDS available per product. Contact support@psllabs.org for institutional requests.",
        illustrationId: "research-docs",
      },
    ],
  },
  timeline: {
    label: "COMMITMENT TO QUALITY",
    title: "How our standards evolved.",
    intro:
      "PSL Labs was built incrementally around one non-negotiable principle: if we cannot verify it independently, we will not sell it.",
    events: [
      {
        phase: "01",
        title: "Specification-first sourcing",
        description:
          "Established release criteria before listing any compound. No product enters the catalog without documented identity, purity, and contaminant thresholds.",
      },
      {
        phase: "02",
        title: "Third-party testing mandate",
        description:
          "Adopted a policy that no batch ships on supplier paperwork alone. Every lot requires independent ISO 17025 laboratory verification.",
      },
      {
        phase: "03",
        title: "Full COA publication",
        description:
          "Moved from summary reports to complete Certificates of Analysis—methods, results, and pass/fail criteria published per lot number.",
      },
      {
        phase: "04",
        title: "48-hour documentation SLA",
        description:
          "Committed to publishing batch COAs within 48 hours of release so researchers can verify before integrating into protocols.",
      },
      {
        phase: "05",
        title: "Continuous panel expansion",
        description:
          "Ongoing annual audits of manufacturing partners and expansion of analytical panels as research-grade expectations evolve.",
      },
    ],
  },
};

/** @deprecated Use aboutContent — kept for any legacy imports */
export const aboutPage = {
  label: aboutContent.hero.label,
  headline: aboutContent.hero.headline,
  intro: aboutContent.hero.intro,
  sections: [],
};
