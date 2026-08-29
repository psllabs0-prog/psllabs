import nodemailer from "nodemailer";

/** Dark-theme transactional email palette (matches site branding). */
export const EMAIL_COLORS = {
  page: "#0B0C0E",
  text: "#E8E9EB",
  muted: "#9CA3AF",
  border: "#2A2D32",
  accent: "#2FB6E0",
  surface: "#141518",
} as const;

export const SUPPORT_EMAIL = "support@psllabs.org";
export const FROM_EMAIL = `PSL Labs <${SUPPORT_EMAIL}>`;

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function shippingLabel(n: number): string {
  return n > 0 ? money(n) : "Free";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createSmtpTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error("SMTP is not configured.");
  }
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  });
}

export function emailPageWrapper(innerHtml: string): string {
  const { page, text } = EMAIL_COLORS;
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:${page};color:${text};line-height:1.5;padding:24px;">${innerHtml}</div>`;
}
