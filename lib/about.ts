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
      "We sell research peptides with published third party lab reports you can check yourself.",
  },
  mission: {
    title: "Built around verification",
    body: "PSL Labs exists to make research product information easier to review: clear labeling, third party testing, and a lab report for each published batch.",
  },
  valueCards: [
    {
      title: "Batch documentation",
      body: "Each batch is tied to the testing records available for that batch.",
    },
    {
      title: "Third party testing",
      body: "We show the lab data so you can review what was measured before you order.",
    },
    {
      title: "Research use only",
      body: "Product information is for laboratory research. Not for human consumption or medical use.",
    },
  ],
  closing: {
    title: "Clear product information. Lab reports you can check yourself.",
    body: "We keep the product details simple and make the matching lab reports easy to find.",
  },
};

/** @deprecated Use aboutContent. Kept for any legacy imports. */
export const aboutPage = {
  label: "ABOUT PSL LABS",
  headline: aboutContent.hero.headline,
  intro: aboutContent.hero.subtitle,
  sections: [],
};
