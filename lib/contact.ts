export type ContactDetail = {
  id: string;
  label: string;
  value: string;
  href?: string;
};

export type ContactTopic = {
  label: string;
  href: string;
};

export type ContactPageContent = {
  label: string;
  headline: string;
  intro: string;
  supportEmail: string;
  details: ContactDetail[];
  topics: ContactTopic[];
  formTitle: string;
  formDescription: string;
};

export const contactPage: ContactPageContent = {
  label: "CONTACT",
  headline: "Get in touch.",
  intro:
    "Questions about your order, batch documentation, or research supply? Our team responds with clear, documented answers—not scripts.",
  supportEmail: "support@psllabs.org",
  details: [
    {
      id: "email",
      label: "Email",
      value: "support@psllabs.org",
      href: "mailto:support@psllabs.org",
    },
    {
      id: "response",
      label: "Response time",
      value: "Within one day",
    },
  ],
  topics: [
    { label: "COA / Batch Lookup", href: "/coa" },
    { label: "Shipping & returns", href: "/shipping" },
    { label: "Frequently asked questions", href: "/faq" },
  ],
  formTitle: "Send a message",
  formDescription:
    "Include your order number or vial lot number when relevant—we can resolve documentation requests faster.",
};
