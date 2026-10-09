import type { ContentPageMeta, ContentSection } from "./types";

export const privacyPageMeta: ContentPageMeta = {
  label: "LEGAL",
  title: "Privacy Policy",
  description: "How PSL Labs collects, uses, and protects your personal information.",
  intro: ["Last updated: October 9, 2026."],
};

export const privacySections: ContentSection[] = [
  {
    id: "collect",
    title: "Information we collect",
    paragraphs: [
      "When you place an order or contact us, you may give us your name, email address, shipping address, and order details. We use that information to fulfill your request. Our payment providers handle card details; PSL Labs does not store your full card number.",
      "Our website uses basic security and operational information to function and prevent abuse. We use the network address supplied by our hosting provider to create a keyed, one-way identifier for temporary request counters, rather than storing the raw address in the rate-limit table. Expired counters are removed during periodic initialization.",
      "Optional advertising information is separate from the information needed to shop. Advertising references and permitted measurement events are collected only when the relevant feature is available and you consent. Declining or making no choice leaves optional advertising off. Administrator activity, demonstration records, synthetic orders, and test purchases are excluded from production advertising signals.",
    ],
  },
  {
    id: "use",
    title: "How we use your information",
    paragraphs: [
      "We use necessary information to process orders, send order and shipping updates, answer support requests, prevent fraud, secure sign-in, and keep checkout working.",
      "With the relevant optional-cookie permission, eligible advertising measurement can help us understand visits and completed website actions. Personalization is a separate purpose: where available and permitted, retargeting can reach eligible past visitors, purchaser exclusions can avoid acquisition advertising to eligible recent purchasers, and similar audiences can help find new people with patterns similar to an eligible source audience. A visit is not proof that someone is a purchaser or a qualified customer.",
    ],
  },
  {
    id: "share",
    title: "Service providers and advertising data sharing",
    paragraphs: [
      "We share necessary information with providers that help operate PSL Labs, including payment processors, shipping carriers, hosting, security, and email services. These essential activities do not depend on optional advertising consent.",
      "Meta measurement, when separately verified and enabled for an eligible page or event, may use the Meta Pixel in your browser and the Conversions API on our server. With permission, Meta may receive permitted website-event names, event times and identifiers, browser or ad-click identifiers, permitted page context, and eligible purchase amounts and currency. Browser requests also reveal technical information such as network address and user agent to the receiving provider. Stable event identifiers help Meta avoid counting the same browser and server action twice. No permission is inferred from accepting the site's researcher-entry gate.",
      "Meta may use eligible, consented data for advertising measurement across Facebook and Instagram. Retargeting, purchaser exclusions, customer matching, and similar-audience uses remain unavailable until their separate data permissions and operational requirements are verified. Availability is shown in Cookie settings. We do not enable automatic advanced matching or upload customer contact lists through this initial setup. Accepting a currently available feature does not authorize a new provider or purpose introduced later.",
      "When Google advertising measurement is enabled and you choose to allow it, Google's tag uses advertising cookies and browser information to connect ad visits with eligible purchases. After payment is verified, the permitted purchase event contains a generated transaction identifier, value, and currency. Personalized advertising and enhanced conversions remain off.",
      "When OpenAI advertising measurement is enabled and you choose to allow it, an eligible completed-purchase event may include its time, amount, currency, generated event identifier, and permitted ad-click reference. This integration does not include your name, email, shipping address, card details, or purchased product names, and it opts events out of future user-level personalization.",
      "TikTok website advertising measurement, customer matching, and audiences are not enabled by these controls. Any future introduction requires a separately eligible integration and a new consent choice before data is shared.",
      "Consent never overrides platform data restrictions. We do not send sensitive health information, medical details, payment-card information, unnecessary personal information, or prohibited product details to advertising platforms. A prohibited event is blocked; removing or renaming fields is not used to conceal its meaning. Research-use-only advertising permission does not itself establish permission to share customer or website-event data.",
      "We do not sell personal information for money. Some advertising uses may constitute sharing for cross-context behavioral advertising under applicable privacy laws. Those optional uses are subject to your choices and applicable opt-out signals.",
    ],
  },
  {
    id: "cookies",
    title: "Cookies, browser storage, and your choices",
    paragraphs: [
      "Essential cookies and browser storage support your shopping cart, administrator sign-in, researcher verification, cookie preferences, payment-return recovery, and security. Card numbers, expiry dates, and security codes are not stored in payment-return browser storage. Declining optional cookies does not disable these essential functions.",
      "After you complete the existing researcher-entry gate, the cookie banner offers Accept all, Decline optional, and Cookie settings. Accept and Decline are equally accessible. Optional advertising tags do not load because you ignored the banner. Use Cookie preferences in the footer at any time to reopen the controls.",
      "We remember optional-cookie choices for up to 180 days using a versioned, revocable server record and an opaque first-party cookie. The record contains choices and revision information rather than an advertising identifier or customer contact details. A browser cache alone cannot grant consent. If preferences cannot be verified, optional advertising stays off. Changes to providers or purposes require a new choice.",
      "Where permitted and consented, ad-click references may be retained in browser storage for up to 30 days and linked to an eligible order. A local Google purchase marker helps avoid duplicate measurement and expires after 30 days. These optional identifiers are cleared from our browser storage when consent is withdrawn or is unavailable; essential cart and payment-recovery storage is preserved.",
      "Our basic website analytics use Plausible without tracking cookies. Optional advertising consent does not authorize other services to receive prohibited data. Third-party payment pages may use their own essential cookies or similar tools to complete and secure a payment.",
    ],
  },
  {
    id: "withdrawal",
    title: "Withdrawal and privacy opt-out signals",
    paragraphs: [
      "To withdraw, open Cookie preferences and choose Decline optional, or turn off a purpose and save. Browser advertising permission is removed immediately and we request server-side revocation. If the server cannot confirm the change, the controls show that withdrawal is pending and retry when the connection returns; optional browser advertising remains off. Previously saved grants are not restored while a withdrawal is pending.",
      "Our browser and server integrations check current permission, including the relevant consent revision, before eligible collection or transmission. Withdrawal stops future permitted collection and use through those integrations after confirmation. Granting permission again does not authorize old orders or queued historical events. Global Privacy Control and applicable opt-out signals override optional advertising choices.",
      "Withdrawal does not automatically erase data an advertising platform already received or guarantee immediate removal from an existing platform audience. Audience features remain unavailable until their consent, eligibility, and withdrawal requirements can be enforced. Contact support@psllabs.org for access, deletion, or other privacy requests concerning data already shared.",
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
      "Depending on where you live, you may have rights to request access to, correction of, or deletion of certain personal information, and to opt out of certain uses or sharing. California residents may have additional rights under the CCPA. Contact support@psllabs.org to make a request.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: ["Questions about this Privacy Policy? Email support@psllabs.org."],
  },
];
