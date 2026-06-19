export type FaqItem = {
  question: string;
  answer: string;
};

export type FaqCategory = {
  id: string;
  title: string;
  items: FaqItem[];
};

export type ContentPageMeta = {
  label: string;
  title: string;
  description: string;
  intro?: string[];
};

export type ContentSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

export type ScienceArticleMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  readTime: string;
};
