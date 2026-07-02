import type { StockStatus } from "./stock";

export type ProductIngredient = {
  name: string;
  dose: string;
  mechanism: string;
};

export type ProductCitation = {
  authors: string;
  title: string;
  journal: string;
  year: number;
  volume?: string;
  pages?: string;
};

export type ProductFaq = {
  question: string;
  answer: string;
};

export type ProductHowToStep = {
  step: number;
  title: string;
  description: string;
};

export type ProductTesting = {
  description: string;
  highlights: string[];
};

export type ProductSpecification = {
  label: string;
  value: string;
};

export type Product = {
  handle: string;
  tag: string;
  name: string;
  shortDescription: string;
  price: number;
  subscribePrice: number;
  whyThisExists: string;
  bullets: string[];
  ingredients: ProductIngredient[];
  howToUse: ProductHowToStep[];
  citations: ProductCitation[];
  faqs: ProductFaq[];
  testing: ProductTesting;
  stackBlurb: string;
  stackRole: string;
  stockStatus: StockStatus;
  imageSrc?: string;
  imageAlt?: string;
  specifications?: ProductSpecification[];
  researchDisclaimer?: string;
};

export type ProductHandle =
  | "foundation"
  | "cellular-energy"
  | "recovery"
  | "retatrutide";
