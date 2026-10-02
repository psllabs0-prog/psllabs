type Env = Record<string, string | undefined>;

export type NewsletterWelcomeMode = "off" | "allowlist" | "on";

export type NewsletterGate = { enabled: boolean; reason: string };

export type NewsletterWelcomeConfig = {
  environment: string;
  mode: NewsletterWelcomeMode;
  modeReason: string;
  allowlist: Set<string>;
  simulate: boolean;
  welcome1: NewsletterGate;
  laterSteps: NewsletterGate;
  prerequisites: {
    smtp: boolean;
    fromEmail: boolean;
    postalAddress: boolean;
    unsubSecret: boolean;
    missing: string[];
  };
  /** Single-opt-in enrollment may run (still per-address in allowlist mode). */
  journey: NewsletterGate;
  /** Settings that are set but no longer have any effect. */
  obsolete: string[];
};

export const NEWSLETTER_ENV = {
  mode: "NEWSLETTER_WELCOME_MODE",
  allowlist: "NEWSLETTER_WELCOME_TEST_ALLOWLIST",
  simulate: "NEWSLETTER_WELCOME_SIMULATE",
  welcome1: "NEWSLETTER_WELCOME_1_ENABLED",
  laterSteps: "NEWSLETTER_WELCOME_LATER_STEPS_ENABLED",
} as const;

/** Double-opt-in confirmation emails are no longer sent (single opt-in); this switch is ignored. */
export const OBSOLETE_ENV = ["NEWSLETTER_CONFIRMATION_SEND_ENABLED"] as const;

const isTrue = (v: string | undefined) => v?.trim().toLowerCase() === "true";

export function normalizeNewsletterEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidNewsletterEmail(email: string): boolean {
  return email.length >= 6 && email.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(email);
}

function environmentName(env: Env): string {
  if (env.VERCEL_ENV) return env.VERCEL_ENV;
  return env.VERCEL ? "vercel" : "local";
}

/**
 * Fails closed: unset or unrecognised mode is "off" (legacy signup only, no
 * new mail). Preview deployments are always off — they share production
 * credentials and must never send or write newsletter state.
 */
export function getNewsletterWelcomeConfig(env: Env = process.env): NewsletterWelcomeConfig {
  const environment = environmentName(env);
  const raw = env[NEWSLETTER_ENV.mode]?.trim().toLowerCase() ?? "";
  let mode: NewsletterWelcomeMode = "off";
  let modeReason = `${NEWSLETTER_ENV.mode} is not set`;
  if (env.VERCEL_ENV === "preview") {
    modeReason = "Preview deployment — the newsletter journey is disabled";
  } else if (raw === "on" || raw === "allowlist") {
    mode = raw;
    modeReason = raw === "on" ? "Journey on for new signups" : "Journey limited to the test allowlist";
  } else if (raw && raw !== "off") {
    modeReason = `${NEWSLETTER_ENV.mode} has an unrecognised value`;
  } else if (raw === "off") {
    modeReason = `${NEWSLETTER_ENV.mode} is off`;
  }

  const allowlist = new Set(
    (env[NEWSLETTER_ENV.allowlist] ?? "")
      .split(",")
      .map(normalizeNewsletterEmail)
      .filter(isValidNewsletterEmail)
  );

  const gate = (key: string, label: string): NewsletterGate =>
    isTrue(env[key]) ? { enabled: true, reason: `${label} enabled` } : { enabled: false, reason: `${key} is not true` };

  const smtp = Boolean(env.SMTP_HOST?.trim() && env.SMTP_USER?.trim() && env.SMTP_PASSWORD?.trim());
  const fromEmail = Boolean(env.MARKETING_FROM_EMAIL?.trim());
  const postalAddress = Boolean(env.MARKETING_POSTAL_ADDRESS?.trim());
  const unsubSecret = Boolean(env.MARKETING_UNSUB_SECRET?.trim());
  const simulate = isTrue(env[NEWSLETTER_ENV.simulate]);
  const missing: string[] = [];
  if (!smtp && !simulate) missing.push("SMTP_HOST/SMTP_USER/SMTP_PASSWORD");
  if (!fromEmail) missing.push("MARKETING_FROM_EMAIL");
  if (!postalAddress) missing.push("MARKETING_POSTAL_ADDRESS");
  if (!unsubSecret) missing.push("MARKETING_UNSUB_SECRET");

  const welcome1 = gate(NEWSLETTER_ENV.welcome1, "Welcome 1");
  const laterSteps = gate(NEWSLETTER_ENV.laterSteps, "Welcome 2 and 3");

  let journey: NewsletterGate;
  if (mode === "off") journey = { enabled: false, reason: modeReason };
  else if (mode === "allowlist" && allowlist.size === 0) journey = { enabled: false, reason: `${NEWSLETTER_ENV.allowlist} is empty` };
  else if (missing.length > 0) journey = { enabled: false, reason: `Missing prerequisites: ${missing.join(", ")}` };
  else if (!welcome1.enabled) journey = welcome1;
  else journey = { enabled: true, reason: modeReason };

  return {
    environment,
    mode,
    modeReason,
    allowlist,
    simulate,
    welcome1,
    laterSteps,
    prerequisites: { smtp, fromEmail, postalAddress, unsubSecret, missing },
    journey,
    obsolete: OBSOLETE_ENV.filter((k) => Boolean(env[k]?.trim())),
  };
}

/**
 * Which signup path an address takes. "legacy" is the pre-existing behaviour
 * (store unconfirmed, send nothing). Allowlisted addresses are TEST records.
 */
export function routeNewsletterSignup(
  email: string,
  config: NewsletterWelcomeConfig
): { path: "legacy" } | { path: "journey"; isTest: boolean } {
  if (!config.journey.enabled) return { path: "legacy" };
  const listed = config.allowlist.has(email);
  if (config.mode === "allowlist" && !listed) return { path: "legacy" };
  return { path: "journey", isTest: listed || config.simulate };
}

/**
 * Public signup copy changes only when the journey is fully on. In allowlist
 * mode the subscribe form with its consent wording is shown only on an
 * unlinked test URL; the server still enrolls allowlisted addresses only.
 */
export function newsletterSignupVariant(
  config: NewsletterWelcomeConfig = getNewsletterWelcomeConfig(),
  options: { allowlistTestView?: boolean } = {}
): "legacy" | "welcome" {
  if (!config.journey.enabled) return "legacy";
  if (config.mode === "on") return "welcome";
  return config.mode === "allowlist" && options.allowlistTestView ? "welcome" : "legacy";
}
