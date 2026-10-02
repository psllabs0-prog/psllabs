/** Client-safe signup copy. Changing any string requires a new version. */
export const NEWSLETTER_SIGNUP_COPY = {
  legacy: {
    version: "legacy-v0",
    eyebrow: "UPDATES",
    heading: "Stay Informed",
    text: "New batch documentation, product availability, and Certificate of Analysis updates.",
    button: "Subscribe",
    consent: null as string | null,
  },
  welcome: {
    version: "signup-v2",
    eyebrow: "UPDATES",
    heading: "Make laboratory reports easier to read",
    text: "Get PSL’s report-reading guide and occasional documentation and availability updates.",
    button: "Subscribe",
    consent:
      "By selecting Subscribe, you agree to receive PSL’s report-reading guide and documentation and availability emails. Unsubscribe anytime." as
        | string
        | null,
  },
} as const;

/** The consent statement shown beside the button; its version and hash are stored with each single-opt-in subscription. */
export const NEWSLETTER_SIGNUP_CONSENT = {
  version: "signup-consent-v2",
  text: NEWSLETTER_SIGNUP_COPY.welcome.consent as string,
} as const;

export const NEWSLETTER_SIGNUP_VERSIONS: string[] = [NEWSLETTER_SIGNUP_COPY.legacy.version, NEWSLETTER_SIGNUP_COPY.welcome.version];
