/** Client-safe signup copy. Changing any string requires a new version. */
export const NEWSLETTER_SIGNUP_COPY = {
  legacy: {
    version: "legacy-v0",
    eyebrow: "UPDATES",
    heading: "Stay Informed",
    text: "New batch documentation, product availability, and Certificate of Analysis updates.",
    button: "Subscribe",
    supporting: null as string | null,
  },
  welcome: {
    version: "signup-v1",
    eyebrow: "UPDATES",
    heading: "Make laboratory reports easier to read",
    text: "Get PSL’s report-reading guide, two short follow-up emails, and occasional documentation and availability updates.",
    button: "Email me the guide",
    supporting: "Confirm your email to subscribe. Unsubscribe at any time." as string | null,
  },
} as const;

export const NEWSLETTER_SIGNUP_VERSIONS: string[] = [NEWSLETTER_SIGNUP_COPY.legacy.version, NEWSLETTER_SIGNUP_COPY.welcome.version];
