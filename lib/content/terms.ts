import type { ContentPageMeta, ContentSection } from "./types";

export const termsPageMeta: ContentPageMeta = {
  label: "LEGAL",
  title: "Terms of Service",
  description: "Terms governing use of psllabs.org and purchase of PSL Labs products.",
  intro: [
    "Last updated: May 2026. By using this site or purchasing our products, you agree to these terms.",
  ],
};

export const termsSections: ContentSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of terms",
    paragraphs: [
      "These Terms of Service govern your access to psllabs.org and your purchase of products from PSL Labs. If you do not agree, do not use this site or purchase our products.",
    ],
  },
  {
    id: "products",
    title: "Research use only",
    paragraphs: [
      "Products, materials, documentation, and related information provided by PSL Labs are intended solely for laboratory research, analytical, and educational reference purposes. They are not intended for human consumption, medical use, therapeutic use, diagnostic use, veterinary use, dietary use, cosmetic use, or use as food, drugs, or supplements.",
      "Statements on this site have not been evaluated by the Food and Drug Administration. Nothing on this site constitutes medical advice, usage guidance, or a recommendation for personal or clinical application.",
      "By purchasing from PSL Labs, you represent that you are qualified to handle research materials under applicable laws and institutional requirements, and that your use will be limited to lawful laboratory research and reference purposes.",
    ],
  },
  {
    id: "orders",
    title: "Orders and payment",
    paragraphs: [
      "All orders are subject to acceptance and availability. We reserve the right to refuse or cancel orders, including for suspected fraud, pricing errors, or inventory limitations. Prices are listed in USD and subject to change without notice.",
    ],
  },
  {
    id: "intellectual-property",
    title: "Intellectual property",
    paragraphs: [
      "All content on this site—including text, design, logos, and product copy—is owned by PSL Labs and protected by applicable intellectual property laws. You may not reproduce or distribute our content without written permission.",
    ],
  },
  {
    id: "limitation",
    title: "Limitation of liability",
    paragraphs: [
      "To the fullest extent permitted by law, PSL Labs is not liable for indirect, incidental, or consequential damages arising from use of our site or products. Our total liability for any claim is limited to the amount you paid for the product giving rise to the claim.",
    ],
  },
  {
    id: "governing-law",
    title: "Governing law",
    paragraphs: [
      "These Terms are governed by the laws of the State of Arizona, without regard to conflict of law principles.",
    ],
  },
];
