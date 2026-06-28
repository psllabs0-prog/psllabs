/**
 * About page content. Replace [PLACEHOLDER: …] blocks with factually accurate copy.
 */

export type AboutSection = {
  id: string;
  label: string;
  title: string;
  paragraphs: string[];
};

export type AboutPageContent = {
  label: string;
  headline: string;
  intro: string;
  sections: AboutSection[];
};

export const aboutPage: AboutPageContent = {
  label: "ABOUT",
  headline: "Research supply built on documentation—not marketing.",
  intro:
    "PSL Labs exists for laboratories and researchers who need compounds they can verify. We publish testing data, cite primary literature, and sell strictly for research use.",
  sections: [
    {
      id: "why",
      label: "WHY WE EXIST",
      title: "Because verification should be the default.",
      paragraphs: [
        "[PLACEHOLDER: Your founding story—what gap in the research supply market you identified and why you started PSL Labs.]",
        "Most suppliers ask you to trust a label. We ask you to read a COA. PSL Labs was built for researchers who treat documentation as part of the protocol—not an afterthought.",
      ],
    },
    {
      id: "quality",
      label: "QUALITY",
      title: "Release specifications, not slogans.",
      paragraphs: [
        "[PLACEHOLDER: Your specific quality standards—e.g. minimum purity threshold, release criteria, handling procedures.]",
        "Every lot must meet documented specifications before it ships. We do not release batches on supplier paperwork alone.",
      ],
    },
    {
      id: "testing",
      label: "THIRD-PARTY TESTING",
      title: "Tested by a lab we don't own.",
      paragraphs: [
        "[PLACEHOLDER: Name your testing partner type, accreditation (e.g. ISO 17025), and panels run per batch—identity, purity, contaminants.]",
        "Results are published as batch-specific Certificates of Analysis. Match your vial lot number to the report on the product page.",
      ],
    },
    {
      id: "standards",
      label: "RESEARCH STANDARDS",
      title: "For laboratory use only.",
      paragraphs: [
        "PSL Labs products are sold strictly for laboratory and research use. They are not intended for human or animal consumption.",
        "[PLACEHOLDER: Any additional compliance positioning—RUO labeling, institutional customers, geographic restrictions.]",
      ],
    },
    {
      id: "documentation",
      label: "DOCUMENTATION",
      title: "Transparency you can audit.",
      paragraphs: [
        "[PLACEHOLDER: What you publish per product—COAs, SDS, compound specs, stability notes, lot lookup process.]",
        "If you cannot verify a batch from our published records, contact us at support@psllabs.com before use in your workflow.",
      ],
    },
  ],
};
