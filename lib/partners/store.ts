import { randomBytes, randomUUID } from "node:crypto";
import { getSql } from "@/lib/db/sql";
import { createPartnerCode, isFollowUpDue, parsePartnerMetrics, partnerDrafts, trackingUrl } from "./logic";
import type { Partner, PartnerInput, PartnersDashboard } from "./types";

export class PartnersUnavailableError extends Error {}

/** Explicit migration only. Request handlers must never call this function. */
export async function migratePartners(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS acquisition_partners (
      id UUID PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      business_name TEXT NOT NULL,
      contact_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      website TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT '/products',
      status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','awaiting_reply','reviewing','active','paused','declined')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_contacted_at TIMESTAMPTZ,
      last_replied_at TIMESTAMPTZ,
      follow_up_due_at TIMESTAMPTZ
    )
  `;
}

export async function assertPartnersAvailable(): Promise<void> {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) throw new PartnersUnavailableError("The partner database is not configured.");
  const sql = getSql();
  const rows = await sql`SELECT to_regclass('public.acquisition_partners') IS NOT NULL AS ready`;
  if (!rows[0]?.ready) throw new PartnersUnavailableError("Partner setup needs its one-time database migration.");
}

type PartnerRow = {
  id: string; code: string; business_name: string; contact_name: string; email: string;
  website: string; source: string; destination: string; status: Partner["status"]; notes: string;
  created_at: string; updated_at: string; last_contacted_at: string | null;
  last_replied_at: string | null; follow_up_due_at: string | null;
};
function date(value: string | null): string | null { return value ? new Date(value).toISOString() : null; }
function toPartner(row: PartnerRow): Partner {
  return {
    id: row.id, code: row.code, businessName: row.business_name, contactName: row.contact_name,
    email: row.email, website: row.website, source: row.source, destination: row.destination, status: row.status, notes: row.notes,
    createdAt: date(row.created_at)!, updatedAt: date(row.updated_at)!, lastContactedAt: date(row.last_contacted_at),
    lastRepliedAt: date(row.last_replied_at), followUpDueAt: date(row.follow_up_due_at),
  };
}

export async function getPartner(id: string): Promise<Partner | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM acquisition_partners WHERE id = ${id} LIMIT 1`;
  return rows.length ? toPartner(rows[0] as PartnerRow) : null;
}

export async function getActivePartnerByCode(code: string): Promise<Pick<Partner, "code" | "destination" | "status"> | null> {
  const sql = getSql();
  // No partner contacts or customer details are selected for this public path.
  const rows = await sql`SELECT code, destination, status FROM acquisition_partners WHERE code = ${code} AND status = 'active' LIMIT 1`;
  return rows.length ? rows[0] as Pick<Partner, "code" | "destination" | "status"> : null;
}

export async function createPartner(input: PartnerInput): Promise<Partner> {
  const sql = getSql();
  const id = randomUUID();
  const code = createPartnerCode(input.businessName, randomBytes(4).toString("hex"));
  const rows = await sql`
    INSERT INTO acquisition_partners (id, code, business_name, contact_name, email, website, source, destination, notes)
    VALUES (${id}, ${code}, ${input.businessName}, ${input.contactName}, ${input.email}, ${input.website}, ${input.source}, ${input.destination}, ${input.notes})
    RETURNING *
  `;
  return toPartner(rows[0] as PartnerRow);
}

/** Optimistic concurrency prevents a stale update from reopening a paused record. */
export async function savePartner(partner: Partner, expectedUpdatedAt: string): Promise<Partner | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE acquisition_partners SET business_name = ${partner.businessName}, contact_name = ${partner.contactName},
      email = ${partner.email}, website = ${partner.website}, source = ${partner.source}, destination = ${partner.destination},
      status = ${partner.status}, notes = ${partner.notes}, last_contacted_at = ${partner.lastContactedAt},
      last_replied_at = ${partner.lastRepliedAt}, follow_up_due_at = ${partner.followUpDueAt}, updated_at = now()
    WHERE id = ${partner.id} AND date_trunc('milliseconds', updated_at) = ${expectedUpdatedAt}::timestamptz
    RETURNING *
  `;
  return rows.length ? toPartner(rows[0] as PartnerRow) : null;
}

export async function loadPartnerMetrics(period?: { start: Date; end: Date }) {
  const sql = getSql();
  const start = period?.start.toISOString() ?? null;
  const end = period?.end.toISOString() ?? null;
  // Paid-order attribution is directional measurement, never proof of commission owed.
  // Read existing orders directly; avoid the order store's automatic schema writes.
  const totals = await sql`
    SELECT p.code, COUNT(o.order_id)::int AS paid_orders, COALESCE(SUM(o.total), 0) AS paid_revenue
    FROM acquisition_partners p LEFT JOIN orders o
      ON o.attribution->'lastAffiliate'->>'utmContent' = p.code
      AND o.attribution->'lastAffiliate'->>'utmSource' = 'affiliate'
      AND o.attribution->'lastAffiliate'->>'utmMedium' = 'affiliate'
      AND o.status IN ('paid', 'shipped') AND o.paid_at IS NOT NULL AND o.currency = 'USD'
      AND (${start}::timestamptz IS NULL OR o.paid_at >= ${start}::timestamptz)
      AND (${end}::timestamptz IS NULL OR o.paid_at < ${end}::timestamptz)
      AND NOT EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = true)
    GROUP BY p.code
  `;
  return parsePartnerMetrics(totals as { code: string; paid_orders: string | number; paid_revenue: string | number }[]);
}

export async function loadPartnerDashboard(now = new Date()): Promise<PartnersDashboard> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM acquisition_partners ORDER BY created_at DESC LIMIT 1000`;
  const metrics = await loadPartnerMetrics();
  const partners = rows.map((row) => {
    const partner = toPartner(row as PartnerRow);
    return { ...partner, trackingUrl: trackingUrl(partner.code), drafts: partnerDrafts(partner), metrics: metrics.get(partner.code) ?? { paidOrders: 0, paidOrderRevenueUsd: 0 } };
  });
  return {
    available: true, partners, outboundSendingEnabled: false,
    summary: {
      partners: partners.length, active: partners.filter((p) => p.status === "active").length,
      followUpsDue: partners.filter((p) => isFollowUpDue(p, now)).length,
      paidOrders: partners.reduce((sum, p) => sum + p.metrics.paidOrders, 0),
      paidOrderRevenueUsd: Math.round(partners.reduce((sum, p) => sum + p.metrics.paidOrderRevenueUsd, 0) * 100) / 100,
    },
  };
}
