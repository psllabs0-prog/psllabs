import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";
import nodemailer from "nodemailer";
import { isDesignPreview } from "@/lib/design-preview";
import { isResearchStatus, RESEARCH_QUALIFICATION_VERSION } from "./qualification";

export const RESEARCH_AUTH_BASE_PATH = "/api/research-auth";
export const RESEARCH_COOKIE_PREFIX = "psl_research";

type AuthSetup = {
  database: BetterAuthOptions["database"];
  secret: string;
  baseURL: string;
  sendPasswordReset: (email: string, url: string) => Promise<void>;
  rateLimitEnabled?: boolean;
  extraTrustedOrigins?: string[];
};

/** Maintained authentication library; dedicated models and cookies never identify partners/admins. */
export function createResearchAuth(setup: AuthSetup) {
  return betterAuth({
    appName: "PSL Labs research account",
    baseURL: setup.baseURL,
    basePath: RESEARCH_AUTH_BASE_PATH,
    secret: setup.secret,
    database: setup.database,
    telemetry: { enabled: false },
    trustedOrigins: [...new Set([setup.baseURL, ...(setup.extraTrustedOrigins ?? [])])],
    emailAndPassword: {
      enabled: true, autoSignIn: true, requireEmailVerification: false,
      minPasswordLength: 12, maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 15 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => setup.sendPasswordReset(user.email, url),
    },
    user: {
      modelName: "research_auth_user",
      additionalFields: {
        researchStatus: { type: "string", required: true, input: true },
        ageConfirmed: { type: "boolean", required: true, input: true },
        researchUseConfirmed: { type: "boolean", required: true, input: true },
        qualificationVersion: { type: "string", required: true, input: false, defaultValue: RESEARCH_QUALIFICATION_VERSION },
        qualifiedAt: { type: "date", required: true, input: false, defaultValue: () => new Date() },
      },
    },
    session: {
      modelName: "research_auth_session", expiresIn: 7 * 86400, updateAge: 86400,
      deferSessionRefresh: true, cookieCache: { enabled: false },
    },
    account: { modelName: "research_auth_account", accountLinking: { enabled: false } },
    verification: { modelName: "research_auth_verification" },
    rateLimit: {
      enabled: setup.rateLimitEnabled ?? true, storage: "database", modelName: "research_auth_rate_limit",
      window: 60, max: 40,
      customRules: {
        "/sign-up/email": { window: 3600, max: 10 },
        "/sign-in/email": { window: 900, max: 10 },
        "/request-password-reset": { window: 3600, max: 5 },
        "/reset-password": { window: 900, max: 10 },
      },
    },
    advanced: {
      cookiePrefix: RESEARCH_COOKIE_PREFIX,
      useSecureCookies: new URL(setup.baseURL).protocol === "https:",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"] },
    },
    databaseHooks: {
      user: {
        create: { before: async user => {
          if (!isResearchStatus(user.researchStatus) || user.ageConfirmed !== true || user.researchUseConfirmed !== true) {
            throw new APIError("BAD_REQUEST", { message: "Select your research status and confirm both research-account declarations." });
          }
          return { data: { ...user, qualificationVersion: RESEARCH_QUALIFICATION_VERSION, qualifiedAt: new Date() } };
        } },
        update: { before: async user => {
          if (("researchStatus" in user && !isResearchStatus(user.researchStatus)) ||
              ("ageConfirmed" in user && user.ageConfirmed !== true) ||
              ("researchUseConfirmed" in user && user.researchUseConfirmed !== true)) {
            throw new APIError("BAD_REQUEST", { message: "Research-account declarations must remain valid." });
          }
        } },
      },
    },
    plugins: [nextCookies()],
  });
}

async function sendPasswordReset(email: string, url: string) {
  const host = process.env.SMTP_HOST?.trim(), user = process.env.SMTP_USER?.trim(), pass = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Account mail is unavailable.");
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user, pass }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  try {
    const result = await transport.sendMail({ from: "PSL Labs <support@psllabs.org>", to: email,
      subject: "Reset your PSL Labs research-account password",
      text: `Use this link to choose a new password for your PSL Labs research account:\n\n${url}\n\nThe link expires in 15 minutes and can be used once. If you did not request it, ignore this email.\n\nPSL Labs`,
    });
    if (!result.accepted?.length || result.rejected?.length) throw new Error("Account mail was not accepted.");
  } finally { transport.close(); }
}

let instance: ReturnType<typeof createResearchAuth> | null = null;
let pool: Pool | null = null;

export function researchAuthConfigured(): boolean {
  return !isDesignPreview() && Boolean((process.env.DATABASE_URL || process.env.POSTGRES_URL)?.trim()) &&
    (process.env.RESEARCH_AUTH_SECRET?.trim().length ?? 0) >= 32;
}

export function getResearchAuth() {
  if (!researchAuthConfigured()) throw new Error("Research-account sign-in is not configured.");
  if (instance) return instance;
  pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 20000 });
  instance = createResearchAuth({ database: pool, secret: process.env.RESEARCH_AUTH_SECRET!.trim(),
    baseURL: process.env.RESEARCH_AUTH_URL?.trim() || "https://www.psllabs.org", sendPasswordReset,
    extraTrustedOrigins: ["https://psllabs.org", "https://www.psllabs.org", "https://pslpayments.com", "https://www.pslpayments.com",
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : [])] });
  return instance;
}
