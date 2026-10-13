import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { getSql } from "@/lib/db/sql";
import { requestCookie } from "@/lib/privacy/server";
import { isDesignPreview } from "@/lib/design-preview";
import { PartnersUnavailableError } from "./store";

export const PARTNER_SESSION_COOKIE = "psl_partner_session";
export const PARTNER_SESSION_SECONDS = 7 * 86400;
export const SIGNIN_LINK_SECONDS = 15 * 60;
const TOKEN = /^[0-9a-f]{64}$/;
const SITE_ORIGIN = "https://www.psllabs.org";
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function secret() {
  const value = process.env.PARTNER_AUTH_SECRET?.trim();
  if (!value || value.length < 32 || isDesignPreview()) throw new PartnersUnavailableError("Partner sign-in is unavailable.");
  return value;
}
function emailValue(value: unknown): string | null {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
}
function signature(value: string) { return createHmac("sha256", secret()).update(`psl-partner-session:${value}`).digest("hex"); }
export function signPartnerSession(token: string, expiresAt: number): string {
  if (!TOKEN.test(token) || !Number.isSafeInteger(expiresAt)) throw new Error("Invalid session payload.");
  const payload = `v1.${token}.${expiresAt}`;
  return `${payload}.${signature(payload)}`;
}
export function verifyPartnerSession(value: string | undefined, now = Date.now()): string | null {
  if (!value || value.length > 200) return null;
  const [version, token, expiry, proof, extra] = value.split(".");
  if (extra !== undefined || version !== "v1" || !TOKEN.test(token ?? "") || !TOKEN.test(proof ?? "") || !/^\d{13}$/.test(expiry ?? "")) return null;
  const expiresAt = Number(expiry);
  if (expiresAt <= now || expiresAt > now + PARTNER_SESSION_SECONDS * 1000 + 60_000) return null;
  try {
    const expected = signature(`${version}.${token}.${expiry}`);
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(proof, "hex")) ? token : null;
  } catch { return null; }
}
function smtpConfiguration() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT || 587);
  return host && user && pass && Number.isInteger(port) && port > 0 && port <= 65535 ? { host, user, pass, port } : null;
}
export async function readPartnerAuthReadiness() {
  let secretConfigured = false;
  try { secret(); secretConfigured = true; } catch { /* Report configuration only, never a credential. */ }
  let schemaReady = false;
  const sql = getSql();
  const rows = await sql`SELECT to_regclass('public.partner_signin_tokens') IS NOT NULL
    AND to_regclass('public.partner_auth_sessions') IS NOT NULL
    AND to_regprocedure('create_partner_signin_token(text,text,integer)') IS NOT NULL AS ready`;
  schemaReady = rows[0]?.ready === true;
  return { secretConfigured, schemaReady, smtpConfigured: Boolean(smtpConfiguration()), smtpDeliveryVerified: false as const };
}
export async function assertPartnerAuthAvailable() {
  secret();
  const readiness = await readPartnerAuthReadiness();
  if (!readiness.schemaReady) throw new PartnersUnavailableError("Partner sign-in needs its one-time database setup.");
}

type SignInMailer = (email: string, url: string) => Promise<void>;
export async function sendPartnerSignInEmail(email: string, url: string, createTransport = nodemailer.createTransport) {
  const config = smtpConfiguration();
  if (!config) throw new PartnersUnavailableError("Partner sign-in mail is unavailable.");
  const { host, user, pass, port } = config;
  const transporter = createTransport({ host, port, secure: port === 465,
    requireTLS: port !== 465, auth: { user, pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  try {
    const result = await transporter.sendMail({ from: "PSL Labs <support@psllabs.org>", to: email,
      subject: "Sign in to your PSL Labs partner account",
      text: `Use this one-time link to sign in to your PSL Labs partner account:\n\n${url}\n\nThe link expires in 15 minutes. If you did not request it, ignore this email. No account changes have been made.\n\nPSL Labs`,
    });
    const address = (value: unknown) => typeof value === "string" ? value.toLowerCase() :
      value && typeof value === "object" && "address" in value && typeof value.address === "string" ? value.address.toLowerCase() : "";
    if (!result.accepted?.some((value: unknown) => address(value) === email.toLowerCase()) || result.rejected?.length) {
      throw new PartnersUnavailableError("Partner sign-in mail was not accepted for delivery.");
    }
  } finally { transporter.close(); }
}

/** Generic response is supplied by the route for known and unknown addresses.
 * The token is hashed at rest, sent only to the stored application address, and
 * can be redeemed once. Requesting sign-in never enrolls a marketing subscriber. */
export async function requestPartnerSignIn(value: unknown, mailer: SignInMailer = sendPartnerSignInEmail): Promise<void> {
  const email = emailValue(value);
  if (!email) return;
  await assertPartnerAuthAvailable();
  // Check outbound configuration before querying existence so a deployment error
  // cannot be used to distinguish registered and unregistered email addresses.
  if (mailer === sendPartnerSignInEmail && !smtpConfiguration()) {
    throw new PartnersUnavailableError("Partner sign-in mail is unavailable.");
  }
  const sql = getSql();
  const token = randomBytes(32).toString("hex");
  const rows = await sql`SELECT create_partner_signin_token(${email}, ${digest(token)}, ${SIGNIN_LINK_SECONDS}) AS email`;
  if (!rows[0]?.email) return;
  try { await mailer(String(rows[0].email), `${SITE_ORIGIN}/api/partners/auth/verify?token=${token}`); }
  catch {
    await sql`UPDATE partner_signin_tokens SET used_at = now() WHERE digest = ${digest(token)}`;
    throw new PartnersUnavailableError("Partner sign-in mail is temporarily unavailable.");
  }
}

export async function redeemPartnerSignIn(value: unknown): Promise<string | null> {
  if (typeof value !== "string" || !TOKEN.test(value)) return null;
  await assertPartnerAuthAvailable();
  const sql = getSql();
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + PARTNER_SESSION_SECONDS * 1000;
  // Single atomic UPDATE wins once; replay/expiry never produces a session.
  const rows = await sql`WITH consumed AS (
    UPDATE partner_signin_tokens SET used_at = now()
    WHERE digest = ${digest(value)} AND used_at IS NULL AND expires_at > now()
    RETURNING partner_id
  ), revoked AS (
    DELETE FROM partner_auth_sessions WHERE partner_id IN (SELECT partner_id FROM consumed)
  ) INSERT INTO partner_auth_sessions (digest, partner_id, expires_at)
    SELECT ${digest(token)}, partner_id, ${new Date(expiresAt).toISOString()}::timestamptz FROM consumed RETURNING partner_id`;
  return rows.length ? signPartnerSession(token, expiresAt) : null;
}

export async function authenticatedPartnerId(request: Request): Promise<string | null> {
  const token = verifyPartnerSession(requestCookie(request, PARTNER_SESSION_COOKIE));
  if (!token) return null;
  try {
    await assertPartnerAuthAvailable();
    const sql = getSql();
    const rows = await sql`SELECT partner_id FROM partner_auth_sessions WHERE digest = ${digest(token)} AND expires_at > now() LIMIT 1`;
    return rows[0] ? String(rows[0].partner_id) : null;
  } catch { return null; }
}
export async function revokePartnerSession(request: Request): Promise<void> {
  const token = verifyPartnerSession(requestCookie(request, PARTNER_SESSION_COOKIE));
  if (!token) return;
  const sql = getSql();
  await sql`DELETE FROM partner_auth_sessions WHERE digest = ${digest(token)}`;
}

export function safePartnerOrderReference(orderId: string): string {
  return `R-${createHmac("sha256", secret()).update(`partner-order:${orderId}`).digest("hex").slice(0, 10).toUpperCase()}`;
}
