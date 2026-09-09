export type ValueCard = {
  title: string;
  body: string;
};

export type AboutContent = {
  hero: {
    headline: string;
    subtitle: string;
  };
  mission: {
    title: string;
    body: string;
  };
  valueCards: ValueCard[];
  closing: {
    title: string;
    body: string;
  };
};

export const aboutContent: AboutContent = {
  hero: {
    headline: "About PSL Labs",
    subtitle:
      "We sell research peptides with published third-party lab reports you can check yourself.",
  },
  mission: {
    title: "Built around verification",
    body: "PSL Labs exists to make research product information easier to review: clear labeling, third-party testing, and lot-specific documentation.",
  },
  valueCards: [
    {
      title: "Batch documentation",
      body: "Each lot is tied to the testing records available for that lot.",
    },
    {
      title: "Third-party testing",
      body: "We show the lab data so you can review what was measured before you order.",
    },
    {
      title: "Research use only",
      body: "Product information is for laboratory research. Not for human consumption or medical use.",
    },
  ],
  closing: {
    title: "Clear information. Straightforward standards.",
    body: "We keep product pages simple, documentation easy to find, and research-use limits easy to understand.",
  },
};

/** @deprecated Use aboutContent — kept for any legacy imports */
export const aboutPage = {
  label: "ABOUT PSL LABS",
  headline: aboutContent.hero.headline,
  intro: aboutContent.hero.subtitle,
  sections: [],
};
