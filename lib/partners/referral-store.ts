import { getSql } from "@/lib/db/sql";
import { isDesignPreview } from "@/lib/design-preview";
import type { Order } from "@/lib/orders/types";
import { INVOICE_EXPIRY_MINUTES, PENDING_GRACE_MINUTES } from "@/lib/inventory/constants";
import { PartnerInputError, validPartnerId } from "./logic";
import { PartnersUnavailableError } from "./store";
import { calculateReferralCommission, normalizeReferralCode, REFERRAL_PILOT, type ReferralCommissionCalculation } from "./referral-logic";
import { referralCodesEnabled } from "./referral-config";
import { migratePartnerRegistrationSchema } from "./registration-store";

export type ReferralTerms = {
  active: boolean; approvedAt: string; version: string;
  discountPercent: number; commissionPercent: number; holdDays: number;
};
export type ReferralCommissionRow = ReferralCommissionCalculation & {
  orderId: string; partnerId: string; code: string; createdAt: string;
  orderStatus: string;
  deliveredAt: string | null; refundedProductAmount: number;
  refundReviewConfirmed: boolean; fraudCleared: boolean;
  items: Array<{ name: string; strength: string; quantity: number; lineTotal: number }>;
  paymentMethod: "card" | "bitcoin" | null;
  paidAt: string | null;
  currency: string;
  payoutId: string | null;
};

/** Additive, explicit migration. No request handler is allowed to run it. */
export async function migrateReferralPilot(): Promise<void> {
  const sql = getSql();
  const required = await sql`SELECT to_regclass('public.acquisition_partners') IS NOT NULL
    AND to_regclass('public.orders') IS NOT NULL AND to_regclass('public.finance_transactions') IS NOT NULL
    AND to_regclass('public.payment_events') IS NOT NULL AS ready`;
  if (!required[0]?.ready) throw new PartnersUnavailableError("Existing partner, order, and finance tables are required.");
  await sql`CREATE TABLE IF NOT EXISTS partner_referral_terms (
    partner_id UUID PRIMARY KEY REFERENCES acquisition_partners(id), version TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true, approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    discount_percent INTEGER NOT NULL CHECK (discount_percent = 10),
    commission_percent INTEGER NOT NULL CHECK (commission_percent = 10),
    hold_days INTEGER NOT NULL CHECK (hold_days = 30))`;
  await sql`CREATE TABLE IF NOT EXISTS partner_referral_claims (
    order_id TEXT PRIMARY KEY REFERENCES orders(order_id),
    partner_id UUID NOT NULL REFERENCES acquisition_partners(id), code TEXT NOT NULL,
    customer_email TEXT NOT NULL, terms_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS partner_referral_claims_customer_idx ON partner_referral_claims(customer_email)`;
  await sql`CREATE TABLE IF NOT EXISTS partner_referral_commissions (
    order_id TEXT PRIMARY KEY REFERENCES partner_referral_claims(order_id),
    delivered_at TIMESTAMPTZ, refunded_product_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (refunded_product_amount >= 0),
    refund_review_confirmed BOOLEAN NOT NULL DEFAULT false, fraud_cleared BOOLEAN NOT NULL DEFAULT false,
    reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS partner_signin_tokens (
    digest TEXT PRIMARY KEY, partner_id UUID NOT NULL REFERENCES acquisition_partners(id),
    expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS partner_signin_tokens_partner_time_idx ON partner_signin_tokens(partner_id, created_at)`;
  await sql`CREATE TABLE IF NOT EXISTS partner_auth_sessions (
    digest TEXT PRIMARY KEY, partner_id UUID NOT NULL REFERENCES acquisition_partners(id),
    expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS partner_auth_sessions_partner_idx ON partner_auth_sessions(partner_id)`;
  await sql`CREATE OR REPLACE FUNCTION create_partner_signin_token(p_email text, p_digest text, p_lifetime int) RETURNS text AS $$
  DECLARE p acquisition_partners%ROWTYPE;
  BEGIN
    SELECT * INTO p FROM acquisition_partners WHERE lower(email) = lower(btrim(p_email)) FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF (SELECT count(*) FROM partner_signin_tokens WHERE partner_id = p.id AND created_at > now() - interval '1 hour') >= 5 THEN RETURN NULL; END IF;
    INSERT INTO partner_signin_tokens (digest, partner_id, expires_at) VALUES (p_digest, p.id, now() + p_lifetime * interval '1 second');
    RETURN p.email;
  END;
  $$ LANGUAGE plpgsql`;
  await sql`CREATE OR REPLACE FUNCTION approve_referral_partner(p_id uuid, p_version text) RETURNS boolean AS $$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('psl-referral-pilot-approval', 0));
    PERFORM id FROM acquisition_partners WHERE id = p_id AND status NOT IN ('declined','paused') FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    INSERT INTO partner_referral_terms (partner_id, version, discount_percent, commission_percent, hold_days)
    VALUES (p_id, p_version, 10, 10, 30)
    ON CONFLICT (partner_id) DO UPDATE SET active = true;
    UPDATE acquisition_partners SET status = 'active', follow_up_due_at = NULL, updated_at = now() WHERE id = p_id;
    RETURN true;
  END;
  $$ LANGUAGE plpgsql`;
  await sql`CREATE OR REPLACE FUNCTION referral_partner_activation_guard() RETURNS trigger AS $$
  BEGIN
    IF NEW.status = 'active' AND OLD.status <> 'active' AND EXISTS
      (SELECT 1 FROM partner_referral_terms WHERE partner_id = NEW.id AND active = true) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('psl-referral-pilot-approval', 0));
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql`;
  await sql`CREATE OR REPLACE TRIGGER referral_partner_activation_limit BEFORE UPDATE OF status ON acquisition_partners
    FOR EACH ROW EXECUTE FUNCTION referral_partner_activation_guard()`;
  // Wrapper leaves the shared stock and payment functions intact. A transaction-scoped
  // customer lock makes both first-customer checking and discounted stock reservation atomic.
  await sql`CREATE OR REPLACE FUNCTION checkout_create_referral_order(
    p_order_id text, p_currency text, p_email text, p_shipping jsonb, p_items jsonb,
    p_subtotal numeric, p_tax_rate numeric, p_tax numeric, p_shipping_cost numeric, p_total numeric,
    p_discount_code text, p_discount_amount numeric, p_expiry_minutes int, p_grace_minutes int
  ) RETURNS jsonb AS $$
  DECLARE
    partner acquisition_partners%ROWTYPE;
    terms partner_referral_terms%ROWTYPE;
    result jsonb;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('psl-first-referral:' || lower(btrim(p_email)), 0));
    SELECT * INTO partner FROM acquisition_partners WHERE code = lower(btrim(p_discount_code)) AND status = 'active' FOR SHARE;
    IF NOT FOUND OR lower(btrim(partner.email)) = lower(btrim(p_email)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This referral code is not eligible for this order.');
    END IF;
    SELECT * INTO terms FROM partner_referral_terms WHERE partner_id = partner.id AND active = true FOR SHARE;
    IF NOT FOUND OR p_currency <> 'USD' OR p_discount_amount <> round(p_subtotal * terms.discount_percent / 100, 2)
      OR p_total <> round(p_subtotal - p_discount_amount + p_tax + p_shipping_cost, 2) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This referral code is not eligible for this order.');
    END IF;
    IF EXISTS (SELECT 1 FROM orders o WHERE lower(btrim(email)) = lower(btrim(p_email)) AND paid_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = true))
      OR EXISTS (SELECT 1 FROM partner_referral_claims c JOIN orders o ON o.order_id = c.order_id
        WHERE c.customer_email = lower(btrim(p_email)) AND o.status = 'pending') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This referral code is not eligible for this order.');
    END IF;
    result := checkout_create_order(p_order_id, p_currency, p_email, p_shipping, p_items,
      p_subtotal, p_tax_rate, p_tax, p_shipping_cost, p_total, lower(btrim(p_discount_code)), p_discount_amount,
      p_expiry_minutes, p_grace_minutes);
    IF result->>'ok' = 'true' THEN
      INSERT INTO partner_referral_claims (order_id, partner_id, code, customer_email, terms_version)
      VALUES (p_order_id, partner.id, partner.code, lower(btrim(p_email)), terms.version);
    END IF;
    RETURN result;
  END;
  $$ LANGUAGE plpgsql`;
  await migratePartnerRegistrationSchema();
}

export async function assertReferralPilotAvailable(): Promise<void> {
  if (isDesignPreview()) throw new PartnersUnavailableError("Referral enrollment is unavailable in this preview.");
  const sql = getSql();
  const rows = await sql`SELECT to_regclass('public.partner_referral_terms') IS NOT NULL
    AND to_regclass('public.partner_referral_claims') IS NOT NULL
    AND to_regclass('public.partner_referral_commissions') IS NOT NULL
    AND to_regclass('public.partner_registration_profiles') IS NOT NULL
    AND to_regclass('public.partner_referral_payout_items') IS NOT NULL
    AND to_regprocedure('checkout_create_referral_order(text,text,text,jsonb,jsonb,numeric,numeric,numeric,numeric,numeric,text,numeric,integer,integer,text)') IS NOT NULL AS ready`;
  if (!rows[0]?.ready) throw new PartnersUnavailableError("The referral pilot needs its one-time database setup.");
}

/** Read back the known migration objects; never accepts a schema, table, or SQL input. */
export async function verifyReferralPilotSchema(): Promise<void> {
  if (isDesignPreview()) throw new PartnersUnavailableError("Referral setup is unavailable in this preview.");
  const sql = getSql();
  const rows = await sql`SELECT to_regclass('public.partner_referral_terms') IS NOT NULL
    AND to_regclass('public.partner_referral_claims') IS NOT NULL
    AND to_regclass('public.partner_referral_commissions') IS NOT NULL
    AND to_regclass('public.partner_signin_tokens') IS NOT NULL
    AND to_regclass('public.partner_auth_sessions') IS NOT NULL
    AND to_regclass('public.partner_registration_profiles') IS NOT NULL
    AND to_regclass('public.partner_referral_payouts') IS NOT NULL
    AND to_regclass('public.partner_referral_payout_items') IS NOT NULL
    AND to_regprocedure('checkout_create_referral_order(text,text,text,jsonb,jsonb,numeric,numeric,numeric,numeric,numeric,text,numeric,integer,integer)') IS NOT NULL
    AND to_regprocedure('approve_referral_partner(uuid,text)') IS NOT NULL
    AND to_regprocedure('create_partner_signin_token(text,text,integer)') IS NOT NULL
    AND to_regprocedure('referral_partner_activation_guard()') IS NOT NULL
    AND to_regprocedure('activate_verified_referral_registration(uuid)') IS NOT NULL
    AND to_regprocedure('record_manual_referral_payout(uuid,uuid,text[],text,text,text,numeric,text)') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'referral_partner_activation_limit'
      AND tgrelid = 'public.acquisition_partners'::regclass AND tgenabled <> 'D' AND NOT tgisinternal) AS ready`;
  if (rows[0]?.ready !== true) throw new PartnersUnavailableError("Referral pilot schema verification did not pass. No partners have been approved.");
}

/** Manual opt-in to these terms; existing outreach partners are never auto-enrolled. */
export async function approveReferralPartner(id: string, reviewConfirmed: unknown): Promise<void> {
  if (!validPartnerId(id) || reviewConfirmed !== true) throw new PartnerInputError("Confirm audience and research-only content review before approving.");
  await assertReferralPilotAvailable();
  const sql = getSql();
  const rows = await sql`SELECT approve_referral_partner(${id}::uuid, ${REFERRAL_PILOT.version}) AS approved`;
  if (rows[0]?.approved !== true) throw new PartnerInputError("Approval was not saved: review the partner status.");
}

/** Return only the transactional code/percentage. Never reveal partner/customer PII or order history. */
export async function lookupReferralDiscount(rawCode: unknown, email?: string): Promise<{ code: string; percent: 0 | 10 } | null> {
  if (!referralCodesEnabled()) return null;
  const code = normalizeReferralCode(rawCode);
  if (!code || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  await assertReferralPilotAvailable();
  const sql = getSql();
  const rows = await sql`SELECT p.code, t.version,
    EXISTS (SELECT 1 FROM orders o WHERE lower(btrim(o.email)) = ${email.trim().toLowerCase()} AND o.paid_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = true)) AS repeat_customer
    FROM acquisition_partners p JOIN partner_referral_terms t ON t.partner_id = p.id
    WHERE p.code = ${code} AND p.status = 'active' AND t.active = true
    AND lower(btrim(p.email)) <> ${email.trim().toLowerCase()}
    AND (t.version = ${REFERRAL_PILOT.version} OR NOT EXISTS (SELECT 1 FROM orders o WHERE lower(btrim(o.email)) = ${email.trim().toLowerCase()} AND o.paid_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = true))
    ) AND NOT EXISTS (SELECT 1 FROM partner_referral_claims c JOIN orders o ON o.order_id = c.order_id
      WHERE c.customer_email = ${email.trim().toLowerCase()} AND o.status = 'pending') LIMIT 1`;
  return rows[0] ? { code: String(rows[0].code), percent: rows[0].repeat_customer === true ? 0 : 10 } : null;
}

/** Same stock reservation operation, enclosed by the first-order/coupon transaction lock. */
export async function reserveReferralOrder(order: Order): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!referralCodesEnabled()) throw new PartnerInputError("Referral discounts are temporarily unavailable.");
  await assertReferralPilotAvailable();
  const sql = getSql();
  const rows = await sql`SELECT checkout_create_referral_order(${order.orderId}, ${order.currency}, ${order.email},
    ${JSON.stringify(order.shipping)}::jsonb, ${JSON.stringify(order.items)}::jsonb,
    ${order.subtotal}, ${order.taxRate}, ${order.tax}, ${order.shippingCost}, ${order.total},
    ${order.discountCode}, ${order.discountAmount}, ${INVOICE_EXPIRY_MINUTES}, ${PENDING_GRACE_MINUTES}, ${order.paymentMethod}) AS result`;
  const result = rows[0]?.result as { ok?: boolean; error?: string } | undefined;
  if (!result?.ok) return { ok: false, error: result?.error ?? "This referral code is not eligible for this order." };
  if (order.attribution) {
    try { await sql`UPDATE orders SET attribution = ${JSON.stringify(order.attribution)}::jsonb WHERE order_id = ${order.orderId}`; }
    catch { console.error("[referrals] Optional attribution could not be saved; checkout remains reserved."); }
  }
  return { ok: true };
}

/** Idempotent internal accounting only. Payment settlement, customer mail and ad events remain independent. */
export async function recordSettledReferralOrder(orderId: string): Promise<void> {
  if (isDesignPreview()) return;
  await assertReferralPilotAvailable();
  const sql = getSql();
  await sql`INSERT INTO partner_referral_commissions (order_id)
    SELECT c.order_id FROM partner_referral_claims c JOIN orders o ON o.order_id = c.order_id
    WHERE c.order_id = ${orderId} AND o.paid_at IS NOT NULL AND o.status IN ('paid','shipped')
    AND NOT EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = true)
    ON CONFLICT (order_id) DO NOTHING`;
}

export async function loadReferralPilotDashboard(partnerId?: string) {
  if (partnerId !== undefined && !validPartnerId(partnerId)) throw new PartnerInputError("Invalid partner reference.");
  await assertReferralPilotAvailable();
  const sql = getSql();
  const termsPromise = sql`SELECT t.*, p.code, p.status FROM partner_referral_terms t JOIN acquisition_partners p ON p.id = t.partner_id
    WHERE (${partnerId ?? null}::uuid IS NULL OR t.partner_id = ${partnerId ?? null}::uuid)`;
  // Candidates come directly from durable claims, so a failed best-effort settlement
  // hook cannot omit earned commission from owner review. GET never writes records.
  const rowsPromise = sql`SELECT c.order_id, c.partner_id, c.code, c.created_at, c.terms_version, o.subtotal, o.discount_amount, o.currency,
    o.items, o.payment_method, payout.payout_id,
    o.status, o.paid_at, o.shipped_at, r.delivered_at, r.refunded_product_amount, r.refund_review_confirmed, r.fraud_cleared,
    lower(btrim(o.email)) = lower(btrim(p.email)) AS self_referral,
    NOT EXISTS (SELECT 1 FROM orders older WHERE lower(btrim(older.email)) = lower(btrim(o.email)) AND older.paid_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = older.order_id AND ft.reporting_excluded = true)
      AND (older.paid_at < o.paid_at OR (older.paid_at = o.paid_at AND older.order_id < o.order_id))) AS first_paid_order,
    EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = true) AS reporting_excluded,
    EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = false
      AND ft.currency = o.currency AND ft.gross_amount = o.total) AS finance_verified,
    EXISTS (SELECT 1 FROM payment_events pe WHERE pe.psl_order_id = o.order_id
      AND (lower(coalesce(pe.payment_status,'')) SIMILAR TO '%(refund|void|chargeback|revers)%'
        OR lower(pe.event_type) SIMILAR TO '%(refund|void|chargeback|revers)%')) AS refund_or_void_detected
    FROM partner_referral_claims c JOIN orders o ON o.order_id = c.order_id JOIN acquisition_partners p ON p.id = c.partner_id
    LEFT JOIN partner_referral_commissions r ON r.order_id = c.order_id
    LEFT JOIN partner_referral_payout_items payout ON payout.order_id = c.order_id
    WHERE (${partnerId ?? null}::uuid IS NULL OR c.partner_id = ${partnerId ?? null}::uuid)
    ORDER BY c.created_at DESC LIMIT 1000`;
  const [terms, rows] = await Promise.all([termsPromise, rowsPromise]);
  const commissions: ReferralCommissionRow[] = rows.map((row) => {
    const deliveredAt = row.delivered_at ? new Date(String(row.delivered_at)).toISOString() : null;
    const refundedProductAmount = Number(row.refunded_product_amount ?? 0);
    return { orderId: String(row.order_id), partnerId: String(row.partner_id), code: String(row.code),
      orderStatus: String(row.status),
      createdAt: new Date(String(row.created_at)).toISOString(), deliveredAt, refundedProductAmount,
      refundReviewConfirmed: row.refund_review_confirmed === true, fraudCleared: row.fraud_cleared === true,
      items: (Array.isArray(row.items) ? row.items : []).map((item: Record<string, unknown>) => ({
        name: String(item.name ?? "Research material"), strength: String(item.strength ?? ""), quantity: Number(item.quantity ?? 0), lineTotal: Number(item.lineTotal ?? 0) })),
      paymentMethod: row.payment_method === "card" || row.payment_method === "bitcoin" ? row.payment_method : null,
      paidAt: row.paid_at ? new Date(String(row.paid_at)).toISOString() : null,
      currency: String(row.currency), payoutId: row.payout_id ? String(row.payout_id) : null,
      ...calculateReferralCommission({ termsVersion: String(row.terms_version ?? "psl-referral-pilot-v1"), productSubtotal: Number(row.subtotal), discountAmount: Number(row.discount_amount),
        refundedProductAmount, currency: String(row.currency), paidAt: row.paid_at ? String(row.paid_at) : null,
        shippedAt: row.shipped_at ? String(row.shipped_at) : null, deliveredAt, status: String(row.status),
        firstPaidOrder: row.first_paid_order === true, selfReferral: row.self_referral === true,
        reportingExcluded: row.reporting_excluded === true, financeVerified: row.finance_verified === true,
        refundOrVoidDetected: row.refund_or_void_detected === true,
        refundReviewConfirmed: row.refund_review_confirmed === true, fraudCleared: row.fraud_cleared === true }),
    };
  });
  const byPartner: Record<string, ReferralTerms> = {};
  for (const row of terms) byPartner[String(row.partner_id)] = { active: row.active === true,
    approvedAt: new Date(String(row.approved_at)).toISOString(), version: String(row.version),
    discountPercent: Number(row.discount_percent), commissionPercent: Number(row.commission_percent), holdDays: Number(row.hold_days) };
  return { ...REFERRAL_PILOT, available: true as const, codesEnabled: referralCodesEnabled(), terms: byPartner,
    activePartners: terms.filter(row => row.active === true && row.status === "active").length,
    commissions, automaticPayoutsEnabled: false as const };
}

/** An expired timestamp alone cannot prove a payment failed. Owner checks the actual
 * provider first, then invalidates the pending order before freeing the coupon claim.
 * The verified settlement binding already refuses failed orders. No refund or payment
 * request is sent by this action, and previous claims are retained for audit. */
export async function releaseUnpaidReferralClaim(input: Record<string, unknown>): Promise<void> {
  if (typeof input.orderId !== "string" || !/^psl_[a-zA-Z0-9_-]{1,100}$/.test(input.orderId) || input.providerUnpaidConfirmed !== true) {
    throw new PartnerInputError("Confirm with the payment provider that this expired order has no settled or pending payment.");
  }
  await assertReferralPilotAvailable();
  const sql = getSql();
  const rows = await sql`UPDATE orders o SET status = 'failed', updated_at = now()
    WHERE o.order_id = ${input.orderId} AND o.status = 'pending' AND o.paid_at IS NULL
    AND EXISTS (SELECT 1 FROM partner_referral_claims c WHERE c.order_id = o.order_id)
    AND ((o.invoice_created_at IS NOT NULL AND o.invoice_created_at < now() - ${INVOICE_EXPIRY_MINUTES} * interval '1 minute')
      OR (o.invoice_created_at IS NULL AND o.created_at < now() - ${PENDING_GRACE_MINUTES} * interval '1 minute'))
    AND NOT EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = o.order_id)
    AND NOT EXISTS (SELECT 1 FROM payment_events pe WHERE pe.psl_order_id = o.order_id
      AND lower(coalesce(pe.payment_status,'')) IN ('settled','paid','succeeded','success','captured','completed','pending'))
    RETURNING o.order_id`;
  if (!rows.length) throw new PartnerInputError("No expired, unpaid pending referral order could be released. Review the actual provider status.");
}

export async function reviewReferralCommission(input: Record<string, unknown>): Promise<void> {
  if (typeof input.orderId !== "string" || !/^psl_[a-zA-Z0-9_-]{1,100}$/.test(input.orderId)) throw new PartnerInputError("Invalid order reference.");
  const deliveredAt = typeof input.deliveredAt === "string" ? Date.parse(input.deliveredAt) : NaN;
  if (!Number.isFinite(deliveredAt) || deliveredAt > Date.now()) throw new PartnerInputError("Enter the confirmed delivery date.");
  if (typeof input.refundedProductAmount !== "number" || !Number.isFinite(input.refundedProductAmount) || input.refundedProductAmount < 0) throw new PartnerInputError("Enter the verified refunded product amount, excluding shipping and tax.");
  if (typeof input.refundReviewConfirmed !== "boolean" || typeof input.fraudCleared !== "boolean") throw new PartnerInputError("Confirm the refund and fraud review choices.");
  await assertReferralPilotAvailable();
  const sql = getSql();
  const rows = await sql`INSERT INTO partner_referral_commissions
    (order_id, delivered_at, refunded_product_amount, refund_review_confirmed, fraud_cleared, reviewed_at)
    SELECT c.order_id, ${new Date(deliveredAt).toISOString()}::timestamptz, ${input.refundedProductAmount},
      ${input.refundReviewConfirmed}, ${input.fraudCleared}, now()
    FROM partner_referral_claims c JOIN orders o ON o.order_id = c.order_id
    WHERE c.order_id = ${input.orderId} AND o.paid_at IS NOT NULL AND o.status = 'shipped' AND o.shipped_at IS NOT NULL
    AND o.shipped_at <= ${new Date(deliveredAt).toISOString()}::timestamptz
    AND ${input.refundedProductAmount} <= o.subtotal - o.discount_amount
    FOR UPDATE OF o
    ON CONFLICT (order_id) DO UPDATE SET delivered_at = EXCLUDED.delivered_at,
      refunded_product_amount = EXCLUDED.refunded_product_amount, refund_review_confirmed = EXCLUDED.refund_review_confirmed,
      fraud_cleared = EXCLUDED.fraud_cleared, reviewed_at = now() RETURNING order_id`;
  if (!rows.length) throw new PartnerInputError("No completed shipped referral order matched these delivery and refund values.");
}
