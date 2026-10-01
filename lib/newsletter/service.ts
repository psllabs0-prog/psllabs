import crypto from "crypto";

import { subscribeNewsletterEmail } from "@/lib/newsletter/store";
import { SITE_URL } from "@/lib/seo";

import {
  getNewsletterWelcomeConfig,
  isValidNewsletterEmail,
  normalizeNewsletterEmail,
  routeNewsletterSignup,
  type NewsletterWelcomeConfig,
} from "./config";
import { getNewsletterWelcomeSchemaState, type NewsletterSendKind } from "./schema";
import { deliverNewsletterEmail } from "./send";
import {
  claimSend,
  confirmConsentRequest,
  createSignupRequest,
  findConsentRequestByTokenHash,
  getSendRecord,
  incrementRateLimit,
  recordSendOutcome,
  SIGNUP_LIMITS,
} from "./welcome-store";
import {
  buildNewsletterConfirmationEmail,
  buildNewsletterWelcomeEmail,
  NEWSLETTER_CONSENT_TEXT_HASH,
  NEWSLETTER_PLACEMENTS,
  NEWSLETTER_PUBLIC_MESSAGES as M,
  NEWSLETTER_SIGNUP_COPY,
  NEWSLETTER_SIGNUP_VERSIONS,
  NEWSLETTER_TEMPLATE_VERSIONS,
} from "./templates";
import {
  CONFIRMATION_TOKEN_TTL_MS,
  createConfirmationToken,
  createNewsletterUnsubscribeToken,
  hashConfirmationToken,
  isConfirmationTokenShape,
  newSubscriptionPublicId,
  rateLimitKey,
} from "./tokens";

export type PublicResult = { status: number; body: Record<string, unknown> };

export type NewsletterContext = {
  now: Date;
  config: NewsletterWelcomeConfig;
  siteUrl: string;
};

export function newsletterContext(now = new Date()): NewsletterContext {
  return { now, config: getNewsletterWelcomeConfig(), siteUrl: SITE_URL };
}

const env = (key: string) => process.env[key]?.trim() ?? "";

function elapsedFrom(now: Date, startedMs: number): Date {
  return new Date(now.getTime() + Math.max(0, Date.now() - startedMs));
}

async function legacySignup(email: string): Promise<PublicResult> {
  const result = await subscribeNewsletterEmail(email);
  if (!result.ok) return { status: 400, body: { error: result.error } };
  return {
    status: 200,
    body: { ok: true, message: "Thank you. You'll receive updates on new batch documentation and product availability." },
  };
}

/**
 * Public signup. Anything not routed to the journey keeps the legacy
 * behaviour exactly (store unconfirmed, send nothing). Journey responses are
 * generic so they never reveal whether an address is registered.
 */
export async function handleNewsletterSignup(
  input: { email: unknown; placement?: unknown; signupCopyVersion?: unknown; honeypot?: unknown; ip: string | null },
  ctx: NewsletterContext
): Promise<PublicResult> {
  const raw = typeof input.email === "string" ? input.email : "";
  const email = normalizeNewsletterEmail(raw);
  const route = routeNewsletterSignup(email, ctx.config);
  if (route.path === "legacy") return legacySignup(raw);

  if (typeof input.honeypot === "string" && input.honeypot.trim() !== "") {
    return { status: 200, body: { message: M.requested } };
  }
  if (!isValidNewsletterEmail(email)) return { status: 400, body: { error: M.invalid } };

  const schema = await getNewsletterWelcomeSchemaState();
  if (!schema.ready) return legacySignup(raw);

  const ipKey = rateLimitKey("ip", input.ip?.trim() || "unknown");
  if (!ipKey) return { status: 503, body: { error: M.unavailable } };
  if ((await incrementRateLimit(ipKey, ctx.now)) > SIGNUP_LIMITS.ipPerHour) {
    return { status: 429, body: { error: M.rateLimited } };
  }
  if ((await incrementRateLimit("global:signup", ctx.now)) > SIGNUP_LIMITS.globalPerHour) {
    return { status: 503, body: { error: M.unavailable } };
  }

  const placement = (NEWSLETTER_PLACEMENTS as readonly string[]).includes(String(input.placement))
    ? String(input.placement)
    : "unknown";
  const signupCopyVersion = NEWSLETTER_SIGNUP_VERSIONS.includes(String(input.signupCopyVersion))
    ? String(input.signupCopyVersion)
    : NEWSLETTER_SIGNUP_COPY.legacy.version;

  const { token, hash } = createConfirmationToken();
  const created = await createSignupRequest({
    email,
    isTest: route.isTest,
    tokenHash: hash,
    placement,
    signupCopyVersion,
    consentVersion: NEWSLETTER_TEMPLATE_VERSIONS.confirmation,
    consentTextHash: NEWSLETTER_CONSENT_TEXT_HASH,
    now: ctx.now,
    expiresAt: new Date(ctx.now.getTime() + CONFIRMATION_TOKEN_TTL_MS),
  });
  if (!created.sendId) return { status: 200, body: { message: M.requested } };

  const claimToken = crypto.randomBytes(16).toString("hex");
  const claim = await claimSend({
    id: created.sendId,
    email,
    claimToken,
    templateVersion: NEWSLETTER_TEMPLATE_VERSIONS.confirmation,
    now: ctx.now,
  });
  if (!claim.claimed) return { status: 200, body: { message: M.requested } };

  const started = Date.now();
  const built = buildNewsletterConfirmationEmail({ siteUrl: ctx.siteUrl, token, postalAddress: env("MARKETING_POSTAL_ADDRESS") });
  const outcome = await deliverNewsletterEmail({ to: email, fromEmail: env("MARKETING_FROM_EMAIL"), built, simulate: ctx.config.simulate });
  await recordSendOutcome({ id: created.sendId, claimToken, ...outcome, at: elapsedFrom(ctx.now, started) });

  if (outcome.status === "accepted" || outcome.status === "simulated") {
    return { status: 200, body: { message: M.requested } };
  }
  if (outcome.status === "unknown") return { status: 202, body: { message: M.uncertain } };
  return { status: 503, body: { error: M.sendFailed } };
}

export type DispatchOutcome =
  | "accepted"
  | "simulated"
  | "failed"
  | "rejected"
  | "unknown"
  | "gated"
  | "suppressed"
  | "stale"
  | "previous_step_not_sent"
  | "not_eligible_yet"
  | "not_found"
  | "busy";

export function stepGate(kind: NewsletterSendKind, config: NewsletterWelcomeConfig): { enabled: boolean; reason: string } {
  if (config.mode === "off") return { enabled: false, reason: config.modeReason };
  if (config.prerequisites.missing.length > 0) return { enabled: false, reason: `Missing prerequisites: ${config.prerequisites.missing.join(", ")}` };
  if (kind === "confirmation") return config.confirmationSend;
  if (kind === "welcome_1") return config.welcome1;
  return config.laterSteps;
}

/** Sends one welcome step if, at this moment, it is enabled and eligible. */
export async function dispatchWelcomeSend(sendId: string, ctx: NewsletterContext): Promise<DispatchOutcome> {
  const rec = await getSendRecord(sendId);
  if (!rec || rec.kind === "confirmation" || !rec.subscriptionPublicId) return "not_found";
  if (!stepGate(rec.kind, ctx.config).enabled) return "gated";
  // Allowlist and simulation modes never touch live records, so a live step is never consumed by a test run.
  if ((ctx.config.mode === "allowlist" || ctx.config.simulate) && !rec.isTest) return "gated";

  const claimToken = crypto.randomBytes(16).toString("hex");
  const claim = await claimSend({
    id: rec.id,
    email: rec.email,
    claimToken,
    templateVersion: NEWSLETTER_TEMPLATE_VERSIONS[rec.kind],
    now: ctx.now,
  });
  if (!claim.claimed) {
    if (claim.reason === "suppressed" || claim.reason === "stale" || claim.reason === "previous_step_not_sent" || claim.reason === "not_eligible_yet") {
      return claim.reason;
    }
    return "busy";
  }

  const started = Date.now();
  const built = buildNewsletterWelcomeEmail({
    kind: rec.kind,
    siteUrl: ctx.siteUrl,
    unsubscribeToken: createNewsletterUnsubscribeToken(rec.subscriptionPublicId),
    postalAddress: env("MARKETING_POSTAL_ADDRESS"),
  });
  const outcome = await deliverNewsletterEmail({ to: rec.email, fromEmail: env("MARKETING_FROM_EMAIL"), built, simulate: ctx.config.simulate });
  await recordSendOutcome({ id: rec.id, claimToken, ...outcome, at: elapsedFrom(ctx.now, started) });
  return outcome.status;
}

export type ConfirmPublicStatus = "confirmed" | "already_confirmed" | "invalid" | "unavailable";

/** Deliberate POST only. Never reveals why a link is unusable. */
export async function handleNewsletterConfirm(input: { token: unknown }, ctx: NewsletterContext): Promise<PublicResult> {
  const unavailable: PublicResult = { status: 503, body: { status: "unavailable" satisfies ConfirmPublicStatus } };
  const invalid: PublicResult = { status: 410, body: { status: "invalid" satisfies ConfirmPublicStatus } };
  if (ctx.config.mode === "off" || ctx.config.prerequisites.missing.length > 0) return unavailable;
  if (!isConfirmationTokenShape(input.token)) return invalid;
  const schema = await getNewsletterWelcomeSchemaState();
  if (!schema.ready) return unavailable;

  const tokenHash = hashConfirmationToken(input.token);
  const request = await findConsentRequestByTokenHash(tokenHash);
  if (!request) return invalid;
  if (ctx.config.mode === "allowlist" && !ctx.config.allowlist.has(request.email)) return unavailable;

  const result = await confirmConsentRequest({ tokenHash, publicId: newSubscriptionPublicId(), now: ctx.now });
  if (result.outcome === "already_confirmed") {
    return { status: 200, body: { status: "already_confirmed" satisfies ConfirmPublicStatus } };
  }
  if (result.outcome === "invalid") return invalid;

  let welcome: DispatchOutcome = "gated";
  if (result.welcome1SendId) {
    try {
      welcome = await dispatchWelcomeSend(result.welcome1SendId, ctx);
    } catch (error) {
      console.error("[newsletter] welcome 1 dispatch error", error instanceof Error ? error.message : "unknown");
      welcome = "busy";
    }
  }
  const guideEmail = welcome === "accepted" ? "sent" : welcome === "simulated" ? "simulated" : "pending";
  return { status: 200, body: { status: "confirmed" satisfies ConfirmPublicStatus, guideEmail } };
}
