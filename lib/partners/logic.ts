import { PARTNER_STATUSES, type Partner, type PartnerInput, type PartnerMetrics, type PartnerStatus } from "./types";

export const PARTNER_ORIGIN = "https://www.psllabs.org";
export const FOLLOW_UP_DAYS = 7;
export const PARTNER_ACTION_HEADER = "x-psl-partners-action";
export class PartnerInputError extends Error {}

function field(value: unknown, name: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f<>]/.test(value)) {
    throw new PartnerInputError(`Invalid ${name}.`);
  }
  const result = value.trim();
  if (required && !result) throw new PartnerInputError(`${name} is required.`);
  return result;
}

export function validateDestination(value: unknown): string {
  if (typeof value !== "string" || !/^\/(products(?:\/[a-z0-9-]+)?|coa|science(?:\/[a-z0-9-]+)?)$/.test(value)) {
    throw new PartnerInputError("Choose a PSL product, products, COA, or science page without query parameters.");
  }
  return value;
}

export function validatePartnerInput(value: unknown): PartnerInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PartnerInputError("Invalid partner details.");
  const item = value as Record<string, unknown>;
  const email = field(item.email, "email", 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PartnerInputError("Enter a valid contact email.");
  const website = field(item.website ?? "", "website", 300);
  if (website) {
    let url: URL;
    try { url = new URL(website); } catch { throw new PartnerInputError("Enter a public HTTPS website."); }
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") || url.hash || url.search) {
      throw new PartnerInputError("Enter a public HTTPS website without credentials, query parameters, or fragments.");
    }
  }
  const notes = item.notes ?? "";
  if (typeof notes !== "string" || notes.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(notes)) {
    throw new PartnerInputError("Notes must be no more than 2,000 characters.");
  }
  return {
    businessName: field(item.businessName, "business name", 120, true),
    contactName: field(item.contactName ?? "", "contact name", 80),
    email, website, source: field(item.source ?? "", "source", 300),
    destination: validateDestination(item.destination ?? "/products"), notes: notes.trim(),
  };
}

export function validateStatus(value: unknown): PartnerStatus {
  if (!(PARTNER_STATUSES as readonly unknown[]).includes(value)) throw new PartnerInputError("Invalid partner status.");
  return value as PartnerStatus;
}

export function validPartnerId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
}

export function validPartnerCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]{0,23})-[0-9a-f]{8}$/.test(value);
}

/** The suffix is supplied by a cryptographically secure server-side generator. */
export function createPartnerCode(businessName: string, suffix: string): string {
  if (!/^[0-9a-f]{8}$/.test(suffix)) throw new PartnerInputError("Invalid code suffix.");
  const prefix = businessName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24).replace(/-$/, "") || "partner";
  return `${prefix}-${suffix}`;
}

export function trackingUrl(code: string): string {
  if (!validPartnerCode(code)) throw new PartnerInputError("Invalid partner code.");
  return `${PARTNER_ORIGIN}/r/${code}`;
}

export function partnerDestination(partner: Pick<Partner, "code" | "destination" | "status">): string | null {
  if (partner.status !== "active" || !validPartnerCode(partner.code)) return null;
  const url = new URL(validateDestination(partner.destination), PARTNER_ORIGIN);
  url.search = new URLSearchParams({ utm_source: "affiliate", utm_medium: "affiliate", utm_campaign: "partners", utm_content: partner.code }).toString();
  return url.toString();
}

export function partnerDrafts(partner: Pick<Partner, "businessName" | "contactName">) {
  const greeting = partner.contactName || `the ${partner.businessName} team`;
  return {
    qualification: {
      subject: `PSL Labs partnership — ${partner.businessName}`,
      body: `Hi ${greeting},\n\nI'd like to learn whether a partnership between PSL Labs and ${partner.businessName} would be a good fit.\n\nCould you share your monthly audience or traffic, the percentage based in the United States, and a couple of relevant content examples? Please also outline the content you'd propose, your commission or fees, and any upfront costs.\n\nPSL Labs sells materials for laboratory research only, not human or animal use. Any partnership would need to reflect that and include clear disclosure of affiliate links.\n\nWe can review the details before agreeing to terms. If this isn't relevant, let me know and we won't follow up.\n\nBest,\nLuke\nPSL Labs`,
    },
    followUp: {
      subject: `Following up: PSL Labs and ${partner.businessName}`,
      body: `Hi ${greeting},\n\nFollowing up on our partnership conversation. If you're interested, please send your audience and U.S. traffic figures, relevant content examples, and proposed fees or commission.\n\nWe're looking for a fit with laboratory research content. No terms are agreed yet. If now isn't a good time or you'd prefer no further contact, just let me know.\n\nBest,\nLuke\nPSL Labs`,
    },
  };
}

export function transitionPartner(partner: Partner, action: "mark_contacted" | "mark_replied" | "pause", now: Date): Partner {
  const updated = { ...partner, updatedAt: now.toISOString() };
  if (action === "pause") return { ...updated, status: "paused", followUpDueAt: null };
  if (action === "mark_replied") {
    return { ...updated, status: ["active", "paused", "declined"].includes(partner.status) ? partner.status : "reviewing", lastRepliedAt: now.toISOString(), followUpDueAt: null };
  }
  if (partner.status === "paused" || partner.status === "declined") throw new PartnerInputError("Reopen this partner before marking a new contact.");
  return { ...updated, status: partner.status === "active" ? "active" : "awaiting_reply", lastContactedAt: now.toISOString(), followUpDueAt: new Date(now.getTime() + FOLLOW_UP_DAYS * 86400000).toISOString() };
}

export function isFollowUpDue(partner: Partner, now: Date): boolean {
  return !["paused", "declined"].includes(partner.status) && Boolean(partner.followUpDueAt && Date.parse(partner.followUpDueAt) <= now.getTime());
}

export function checkPartnerOrigin(request: Request): boolean {
  if (request.headers.get(PARTNER_ACTION_HEADER) !== "1") return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  return origin ? origin === new URL(request.url).origin : request.headers.get("sec-fetch-site") === "same-origin";
}

export function parsePartnerMetrics(rows: { code: string; paid_orders: string | number; paid_revenue: string | number }[]): Map<string, PartnerMetrics> {
  const metrics = new Map<string, PartnerMetrics>();
  for (const row of rows) {
    const orders = Number(row.paid_orders);
    const revenue = Number(row.paid_revenue);
    if (validPartnerCode(row.code) && Number.isSafeInteger(orders) && orders >= 0 && Number.isFinite(revenue) && revenue >= 0) {
      metrics.set(row.code, { paidOrders: orders, paidOrderRevenueUsd: Math.round(revenue * 100) / 100 });
    }
  }
  return metrics;
}
