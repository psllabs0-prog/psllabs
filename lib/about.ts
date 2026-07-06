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
      "PSL Labs focuses on research-use documentation, batch transparency, and clean access to product information for laboratory and analytical reference.",
  },
  mission: {
    title: "Built Around Verification",
    body: "PSL Labs was created to make research product information easier to review through clear labeling, third-party testing references, and lot-specific documentation.",
  },
  valueCards: [
    {
      title: "Batch Documentation",
      body: "Each lot is organized around available testing records and product-specific documentation.",
    },
    {
      title: "Third-Party Testing",
      body: "Testing information is reviewed and displayed so users can evaluate available batch data before making decisions.",
    },
    {
      title: "Research-Use Focus",
      body: "Product information is presented for laboratory research and educational reference only, not for human consumption or medical use.",
    },
  ],
  closing: {
    title: "Clear Information. Cleaner Standards.",
    body: "Our goal is to keep product pages simple, documentation easy to find, and research-use disclaimers clear across the site.",
  },
};

/** @deprecated Use aboutContent — kept for any legacy imports */
export const aboutPage = {
  label: "ABOUT PSL LABS",
  headline: aboutContent.hero.headline,
  intro: aboutContent.hero.subtitle,
  sections: [],
};
