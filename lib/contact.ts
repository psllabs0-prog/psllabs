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
    "Questions about an order, a batch report, or a product listing? Email us and we will get back with a clear answer.",
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
    { label: "Batch Reports", href: "/coa" },
    { label: "Shipping & returns", href: "/shipping" },
    { label: "Frequently asked questions", href: "/faq" },
  ],
  formTitle: "Send a message",
  formDescription:
    "If you have an order number or vial lot number, include it. That helps us find the right paperwork faster.",
};
