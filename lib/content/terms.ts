import type { ContentPageMeta, ContentSection } from "./types";
import { LEGAL_ENTITY_NAME, TERMS_LAST_UPDATED } from "./testing-scope";

export const termsPageMeta: ContentPageMeta = {
  label: "LEGAL",
  title: "Terms of Service",
  description: "Terms for using psllabs.org and buying products from PSL Group LLC.",
  intro: [`Last updated: ${TERMS_LAST_UPDATED}.`],
};

export const termsSections: ContentSection[] = [
  {
    id: "acceptance",
    title: "Introduction",
    paragraphs: [
      `These Terms explain the rules for using psllabs.org and buying products from ${LEGAL_ENTITY_NAME}. By using the site or placing an order, you agree to these Terms. If you do not agree, please do not use the site or place an order.`,
    ],
  },
  {
    id: "products",
    title: "Research use only",
    paragraphs: [
      "Products and information on this site are provided only for laboratory research, analytical work, and educational reference. They are not sold for use in people or animals and are not intended for medical, therapeutic, diagnostic, veterinary, dietary, cosmetic, food, drug, or supplement use.",
      "Statements on this site have not been evaluated by the Food and Drug Administration. Nothing on this site is medical advice, instructions for use, or a recommendation for personal or clinical use.",
      `By placing an order, you confirm that you are allowed to handle the materials you purchase and that you will use them only for lawful laboratory research or reference work.`,
    ],
  },
  {
    id: "orders",
    title: "Orders and payment",
    paragraphs: [
      "All orders are subject to availability and acceptance. We may refuse or cancel an order because of suspected fraud, pricing errors, inventory issues, or other legitimate business reasons. Prices are shown in U.S. dollars and may change without notice.",
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual property",
    paragraphs: [
      `Unless otherwise stated, the text, design, logos, images, and product copy on this site belong to ${LEGAL_ENTITY_NAME}. You may not copy or distribute them without written permission.`,
    ],
  },
  {
    id: "limitation",
    title: "Limitation of liability",
    paragraphs: [
      // FLAG: Wording simplified for readability only. Legal substance preserved (indirect/incidental/consequential damages excluded; liability capped at amount paid for the product). Counsel should confirm if further edits are needed.
      `To the fullest extent permitted by law, ${LEGAL_ENTITY_NAME} is not liable for indirect, incidental, or consequential damages arising from use of our site or products. Our total liability for any claim is limited to the amount you paid for the product giving rise to the claim.`,
    ],
  },
  {
    id: "governing-law",
    title: "Governing law",
    paragraphs: [
      "These Terms are governed by the laws of the State of Arizona, without regard to conflict of law principles.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [
      "Questions about these Terms? Email support@psllabs.org.",
    ],
  },
];
