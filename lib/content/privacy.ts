import type { ContentPageMeta, ContentSection } from "./types";
import { PRIVACY_LAST_UPDATED } from "./testing-scope";

export const privacyPageMeta: ContentPageMeta = {
  label: "LEGAL",
  title: "Privacy Policy",
  description: "How PSL Labs collects, uses, and protects your personal information.",
  intro: [`Last updated: ${PRIVACY_LAST_UPDATED}.`],
};

export const privacySections: ContentSection[] = [
  {
    id: "collect",
    title: "Information we collect",
    paragraphs: [
      "When you place an order or contact us, you may give us information such as your name, email address, shipping address, and order details. Payment information is handled by our payment provider. PSL Labs does not store your full card number.",
      "We also collect basic information about how the website is used, such as browser information, pages viewed, and referral information through the analytics tools used on the site.",
      "Advertising links may include a reference that identifies an ad click. Campaign information is retained in your browser for up to 30 days and may be saved with your order to measure which advertising leads to completed purchases.",
      "To limit automated abuse, we use the network address supplied by our hosting provider to create a keyed, one-way identifier. Temporary request counters use that identifier rather than storing the raw address in the rate-limit table; expired counters are removed during periodic table initialization.",
    ],
  },
  {
    id: "use",
    title: "How we use your information",
    paragraphs: [
      "We use this information to process orders, send order and shipping updates, answer support requests, prevent fraud, and improve the website.",
    ],
  },
  {
    id: "share",
    title: "Information sharing",
    paragraphs: [
      "We share information only with service providers that help us run the business, such as payment processors, shipping carriers, email providers, and analytics services.",
      "When OpenAI advertising measurement is enabled, we send OpenAI a completed-purchase event containing its time, amount, currency, a generated event identifier and an available ad-click reference. This integration does not send your name, email, shipping address, card details or the products you purchased. We suppress these events when a Global Privacy Control preference was received at checkout and opt the events out of future user-level personalization.",
      "When Google advertising measurement is enabled and you choose to allow it, Google’s tag uses advertising cookies and browser information to connect ad visits with purchases. After our server verifies payment, we send a generated transaction identifier, purchase value and currency. We do not include your name, email, shipping address, card details or purchased product names in that event, and we keep personalized advertising and enhanced conversions off. A Global Privacy Control preference keeps this Google measurement off.",
      "We do not sell your personal information.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies",
    paragraphs: [
      // Verified against codebase: public site analytics use Plausible (cookieless). Admin login uses a session cookie. Checkout payment fields are handled by third-party payment providers.
      "We use a small number of cookies when needed for site function, such as securing an admin sign-in session. Website analytics on psllabs.org use Plausible Analytics, which is set up to work without tracking cookies.",
      "Payment pages may use cookies or similar tools from our payment providers. You can control cookies through your browser settings where your browser allows it.",
      "Campaign information uses browser local storage. Card checkout also uses temporary session storage to recover payment confirmation after a bank redirect; card numbers, expiry dates and security codes are not stored there.",
      "Google advertising measurement is optional. When it is enabled on the site, use Advertising preferences in the footer to allow or decline it, or change your choice later. We remember that choice in your browser for up to 180 days and load Google’s advertising tag only after you allow measurement. We keep a local purchase-measurement marker to reduce duplicate events; that marker is treated as expired after 30 days.",
    ],
  },
  {
    id: "security",
    title: "Data security",
    paragraphs: [
      "We use reasonable technical and organizational safeguards to protect customer information. No method of sending or storing information online can be guaranteed to be completely secure.",
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    paragraphs: [
      "Depending on where you live, you may have rights to request access to, correction of, or deletion of certain personal information. Contact support@psllabs.org if you want to make a request.",
      "California residents may have additional rights under the CCPA. Contact us if you want to make a request under those rights.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [
      "Questions about this Privacy Policy? Email support@psllabs.org.",
    ],
  },
];
