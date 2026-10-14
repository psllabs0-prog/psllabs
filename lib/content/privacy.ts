import type { ContentPageMeta, ContentSection } from "./types";

export const privacyPageMeta: ContentPageMeta = {
  label: "LEGAL",
  title: "Privacy Policy",
  description: "How PSL Labs collects, uses, and protects your personal information.",
  intro: ["Last updated: October 13, 2026."],
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
      "When available in Cookie settings and you allow both Advertising measurement and Personalized advertising, the Meta Pixel and our server's Conversions API may share PageView events for the research catalog at /products. This first release does not send Meta product-view, cart, checkout or purchase events, product identifiers, purchase amounts or customer contact details. Meta may receive the actual permitted catalog URL, event name, time and identifier, an optional browser identifier, and technical network-address and user-agent information. A Meta ad-click reference may be present in the permitted actual URL. Stable event identifiers help Meta avoid counting the same browser and server action twice. Accepting the site's age and research-use declaration does not grant advertising-cookie permission or verify professional credentials.",
      "Meta may use permitted, consented data for advertising measurement and personalization across Facebook and Instagram. Availability is shown in Cookie settings. Permission for this data sharing does not mean PSL's retargeting, purchaser exclusions, or similar-audience features are enabled. Those features remain unavailable until their separate eligibility, consent, withdrawal, and operational requirements are verified. We do not enable automatic advanced matching or upload customer contact lists through this setup. Accepting a currently available feature does not authorize a new provider or purpose introduced later.",
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
      "Essential cookies and browser storage support your shopping cart, administrator sign-in, age and research-use declaration, cookie preferences, payment-return recovery, and security. The entry gate records visitors' stated age and laboratory-only intended use; it does not authenticate researcher credentials. Card numbers, expiry dates, and security codes are not stored in payment-return browser storage. Declining optional cookies does not disable these essential functions.",
      "After you complete the existing age and research-use declaration, the cookie banner offers Accept all, Decline optional, and Cookie settings. Accept and Decline are equally accessible. Optional advertising tags do not load because you ignored the banner. Use Cookie preferences in the footer at any time to reopen the controls.",
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
    id: "partners",
    title: "Partner applications, sign-in and referrals",
    paragraphs: [
      "When you register for the partner program, we collect your name or organization, email, preferred referral code, selected manual payout method and payout contact, and agreement to the program terms. We use this information to verify your email, administer your partner account and arrange commission payments. Registering does not subscribe you to marketing messages or authorize advertising data sharing. We do not request bank passwords or payment-card credentials in the partner registration form.",
      "Partner sign-in uses a short-lived, one-time email link and an essential first-party account session lasting up to seven days. Sign-in links expire after 15 minutes. We store hashes of the sign-in and session tokens, not the original tokens. Sign out to revoke a session. Partner account pages and sign-in endpoints do not load storefront analytics or advertising tools.",
      "An approved referral code entered explicitly at checkout is part of the requested transaction. It may be recorded with the eligible order to validate the discount, prevent self-referrals and duplicate use, and calculate the partner commission. It does not enable optional advertising cookies. Optional referral-link attribution remains subject to measurement consent, withdrawal and applicable privacy opt-out signals.",
      "Partners see only their own account, code, referred order references, purchased research-material names and quantities, eligible totals, commission status and manual payout records. They do not receive customer contact details, addresses, payment-card information or private medical information through their portal. We do not send partner registrations, sign-in tokens, purchased-item details or commission records to advertising platforms. Contact support@psllabs.org to request access, correction, closure or deletion of partner information, subject to required transaction records.",
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
