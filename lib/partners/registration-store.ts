import { randomBytes, randomUUID } from "node:crypto";
import { getSql } from "@/lib/db/sql";
import { isDesignPreview } from "@/lib/design-preview";
import { createPartnerCode, PartnerInputError } from "./logic";
import { REFERRAL_PILOT } from "./referral-logic";
import { assertPartnersAvailable, PartnersUnavailableError } from "./store";
import { validateManualPayout, type PartnerRegistration } from "./registration-logic";

/** Explicit migration only. Never called by registration, sign-in, checkout or payout requests. */
export async function migratePartnerRegistrationSchema() {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS partner_registration_profiles (
    partner_id UUID PRIMARY KEY REFERENCES acquisition_partners(id),
    terms_version TEXT NOT NULL, accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    email_verified_at TIMESTAMPTZ,
    payout_method TEXT NOT NULL CHECK (payout_method IN ('zelle','arrange')),
    payout_contact TEXT NOT NULL DEFAULT '')`;
  await sql`CREATE TABLE IF NOT EXISTS partner_referral_payouts (
    id UUID PRIMARY KEY, partner_id UUID NOT NULL REFERENCES acquisition_partners(id),
    period TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'), method TEXT NOT NULL,
    reference TEXT NOT NULL, paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_by TEXT NOT NULL, UNIQUE(partner_id, reference))`;
  await sql`CREATE TABLE IF NOT EXISTS partner_referral_payout_items (
    order_id TEXT PRIMARY KEY REFERENCES partner_referral_claims(order_id),
    payout_id UUID NOT NULL REFERENCES partner_referral_payouts(id),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0))`;
  await sql`CREATE INDEX IF NOT EXISTS partner_referral_payouts_partner_idx ON partner_referral_payouts(partner_id, paid_at)`;
  await sql`CREATE OR REPLACE FUNCTION register_referral_partner(
    p_id uuid, p_email text, p_name text, p_code text, p_fallback_code text,
    p_version text, p_payout_method text, p_payout_contact text
  ) RETURNS boolean AS $$
  DECLARE chosen text;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('psl-partner-email:' || lower(btrim(p_email)), 0));
    IF EXISTS (SELECT 1 FROM acquisition_partners WHERE lower(email) = lower(btrim(p_email))) THEN RETURN false; END IF;
    chosen := lower(p_code);
    PERFORM pg_advisory_xact_lock(hashtextextended('psl-partner-code:' || chosen, 0));
    IF chosen IN ('bitcoin','admin','checkout','support') OR EXISTS (SELECT 1 FROM acquisition_partners WHERE code = chosen) THEN chosen := p_fallback_code; END IF;
    INSERT INTO acquisition_partners (id, code, business_name, contact_name, email, source, destination, notes)
      VALUES (p_id, chosen, p_name, p_name, lower(btrim(p_email)), 'Self-service referral registration', '/products', 'Email verification required before activation.');
    INSERT INTO partner_registration_profiles (partner_id, terms_version, payout_method, payout_contact)
      VALUES (p_id, p_version, p_payout_method, p_payout_contact);
    RETURN true;
  END;
  $$ LANGUAGE plpgsql`;
  await sql`CREATE OR REPLACE FUNCTION accept_verified_referral_terms(
    p_id uuid, p_method text, p_contact text
  ) RETURNS boolean AS $$
  BEGIN
    PERFORM id FROM acquisition_partners WHERE id = p_id AND status NOT IN ('paused','declined') FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    INSERT INTO partner_registration_profiles (partner_id, terms_version, payout_method, payout_contact, email_verified_at)
      VALUES (p_id, 'psl-referral-program-v2', p_method, p_contact, now())
      ON CONFLICT (partner_id) DO UPDATE SET terms_version = EXCLUDED.terms_version, accepted_at = now(),
        payout_method = EXCLUDED.payout_method, payout_contact = EXCLUDED.payout_contact,
        email_verified_at = coalesce(partner_registration_profiles.email_verified_at, now());
    RETURN activate_verified_referral_registration(p_id);
  END;
  $$ LANGUAGE plpgsql`;
  await sql`CREATE OR REPLACE FUNCTION activate_verified_referral_registration(p_id uuid) RETURNS boolean AS $$
  DECLARE registration partner_registration_profiles%ROWTYPE;
  BEGIN
    PERFORM id FROM acquisition_partners WHERE id = p_id AND status NOT IN ('paused','declined') FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT * INTO registration FROM partner_registration_profiles WHERE partner_id = p_id FOR UPDATE;
    IF NOT FOUND OR registration.terms_version <> 'psl-referral-program-v2' THEN RETURN false; END IF;
    UPDATE partner_registration_profiles SET email_verified_at = coalesce(email_verified_at, now()) WHERE partner_id = p_id;
    INSERT INTO partner_referral_terms (partner_id, version, discount_percent, commission_percent, hold_days)
      VALUES (p_id, registration.terms_version, 10, 10, 30)
      ON CONFLICT (partner_id) DO UPDATE SET version = EXCLUDED.version, active = true;
    UPDATE acquisition_partners SET status = 'active', updated_at = now(), follow_up_due_at = NULL WHERE id = p_id;
    RETURN true;
  END;
  $$ LANGUAGE plpgsql`;
  // New overload adds payment method; old v1 function remains available for rollback.
  await sql`CREATE OR REPLACE FUNCTION checkout_create_referral_order(
    p_order_id text, p_currency text, p_email text, p_shipping jsonb, p_items jsonb,
    p_subtotal numeric, p_tax_rate numeric, p_tax numeric, p_shipping_cost numeric, p_total numeric,
    p_discount_code text, p_discount_amount numeric, p_expiry_minutes int, p_grace_minutes int, p_payment_method text
  ) RETURNS jsonb AS $$
  DECLARE partner acquisition_partners%ROWTYPE; terms partner_referral_terms%ROWTYPE;
    result jsonb; repeat_customer boolean; expected_discount numeric;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('psl-first-referral:' || lower(btrim(p_email)), 0));
    SELECT * INTO partner FROM acquisition_partners WHERE code = lower(btrim(p_discount_code)) AND status = 'active' FOR SHARE;
    IF NOT FOUND OR lower(btrim(partner.email)) = lower(btrim(p_email)) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This referral code is not eligible for this order.'); END IF;
    SELECT * INTO terms FROM partner_referral_terms WHERE partner_id = partner.id AND active = true FOR SHARE;
    IF NOT FOUND OR p_currency <> 'USD' OR p_payment_method NOT IN ('bitcoin','card') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This referral code is not eligible for this order.'); END IF;
    SELECT EXISTS (SELECT 1 FROM orders o WHERE lower(btrim(o.email)) = lower(btrim(p_email)) AND o.paid_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM finance_transactions ft WHERE ft.psl_order_id = o.order_id AND ft.reporting_excluded = true)) INTO repeat_customer;
    IF (terms.version <> 'psl-referral-program-v2' AND (repeat_customer OR p_payment_method <> 'bitcoin')) OR
      EXISTS (SELECT 1 FROM partner_referral_claims c JOIN orders o ON o.order_id = c.order_id
        WHERE c.customer_email = lower(btrim(p_email)) AND o.status = 'pending') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'This referral code is not eligible for this order.'); END IF;
    expected_discount := CASE WHEN NOT repeat_customer THEN round(p_subtotal * terms.discount_percent / 100, 2)
      WHEN p_payment_method = 'bitcoin' THEN round(p_subtotal * 5 / 100, 2) ELSE 0 END;
    IF p_discount_amount <> expected_discount OR p_total <> round(p_subtotal - p_discount_amount + p_tax + p_shipping_cost, 2) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Your referral eligibility or total changed. Reapply the code before checking out.'); END IF;
    result := checkout_create_order(p_order_id, p_currency, p_email, p_shipping, p_items,
      p_subtotal, p_tax_rate, p_tax, p_shipping_cost, p_total, partner.code, p_discount_amount, p_expiry_minutes, p_grace_minutes);
    IF result->>'ok' = 'true' THEN
      INSERT INTO partner_referral_claims (order_id, partner_id, code, customer_email, terms_version)
        VALUES (p_order_id, partner.id, partner.code, lower(btrim(p_email)), terms.version);
      UPDATE orders SET payment_method = p_payment_method WHERE order_id = p_order_id;
    END IF;
    RETURN result;
  END;
  $$ LANGUAGE plpgsql`;
  await sql`CREATE OR REPLACE FUNCTION record_manual_referral_payout(
    p_id uuid, p_partner uuid, p_orders text[], p_period text, p_reference text,
    p_method text, p_expected numeric, p_actor text
  ) RETURNS boolean AS $$
  DECLARE eligible_count int; amount_sum numeric;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('psl-partner-payout:' || p_partner::text, 0));
    PERFORM o.order_id FROM orders o WHERE o.order_id = ANY(p_orders) FOR UPDATE;
    PERFORM r.order_id FROM partner_referral_commissions r WHERE r.order_id = ANY(p_orders) FOR UPDATE;
    SELECT count(*), coalesce(sum(round((o.subtotal - o.discount_amount - r.refunded_product_amount) * t.commission_percent / 100, 2)), 0)
      INTO eligible_count, amount_sum
    FROM partner_referral_claims c JOIN orders o ON o.order_id = c.order_id
    JOIN partner_referral_commissions r ON r.order_id = c.order_id
    JOIN partner_referral_terms t ON t.partner_id = c.partner_id
    JOIN acquisition_partners p ON p.id = c.partner_id
    WHERE c.partner_id = p_partner AND c.order_id = ANY(p_orders)
      AND o.status = 'shipped' AND o.paid_at IS NOT NULL AND o.currency = 'USD'
      AND lower(btrim(o.email)) <> lower(btrim(p.email))
      AND r.delivered_at >= o.shipped_at AND r.delivered_at <= now() - t.hold_days * interval '1 day'
      AND r.refund_review_confirmed AND r.fraud_cleared
      AND r.refunded_product_amount < o.subtotal - o.discount_amount
      AND round((o.subtotal - o.discount_amount - r.refunded_product_amount) * t.commission_percent / 100, 2) > 0
      AND NOT EXISTS (SELECT 1 FROM partner_referral_payout_items i WHERE i.order_id = c.order_id)
      AND NOT EXISTS (SELECT 1 FROM finance_transactions f WHERE f.psl_order_id = o.order_id AND f.reporting_excluded)
      AND EXISTS (SELECT 1 FROM finance_transactions f WHERE f.psl_order_id = o.order_id AND NOT f.reporting_excluded AND f.currency = o.currency AND f.gross_amount = o.total)
      AND NOT EXISTS (SELECT 1 FROM payment_events e WHERE e.psl_order_id = o.order_id AND
        (lower(coalesce(e.payment_status,'')) SIMILAR TO '%(refund|void|chargeback|revers)%' OR lower(e.event_type) SIMILAR TO '%(refund|void|chargeback|revers)%'))
      AND (c.terms_version = 'psl-referral-program-v2' OR (o.discount_amount = round(o.subtotal * 0.1, 2)
        AND NOT EXISTS (SELECT 1 FROM orders older WHERE lower(btrim(older.email)) = lower(btrim(o.email)) AND older.paid_at IS NOT NULL
          AND (older.paid_at < o.paid_at OR (older.paid_at = o.paid_at AND older.order_id < o.order_id))
          AND NOT EXISTS (SELECT 1 FROM finance_transactions f WHERE f.psl_order_id = older.order_id AND f.reporting_excluded))));
    IF eligible_count <> cardinality(p_orders) OR amount_sum <= 0 OR amount_sum <> p_expected THEN RETURN false; END IF;
    INSERT INTO partner_referral_payouts (id, partner_id, period, amount, method, reference, recorded_by)
      VALUES (p_id, p_partner, p_period, amount_sum, p_method, p_reference, p_actor);
    INSERT INTO partner_referral_payout_items (order_id, payout_id, amount)
      SELECT c.order_id, p_id, round((o.subtotal - o.discount_amount - r.refunded_product_amount) * 0.1, 2)
      FROM partner_referral_claims c JOIN orders o ON o.order_id = c.order_id
      JOIN partner_referral_commissions r ON r.order_id = c.order_id WHERE c.order_id = ANY(p_orders);
    RETURN true;
  END;
  $$ LANGUAGE plpgsql`;
}

export async function assertPartnerProgramAvailable() {
  if (isDesignPreview()) throw new PartnersUnavailableError("Preview registration does not create real partner accounts.");
  await assertPartnersAvailable();
  const sql = getSql();
  const rows = await sql`SELECT to_regclass('public.partner_registration_profiles') IS NOT NULL
    AND to_regclass('public.partner_referral_payouts') IS NOT NULL
    AND to_regclass('public.partner_referral_payout_items') IS NOT NULL
    AND to_regprocedure('register_referral_partner(uuid,text,text,text,text,text,text,text)') IS NOT NULL
    AND to_regprocedure('activate_verified_referral_registration(uuid)') IS NOT NULL AS ready`;
  if (rows[0]?.ready !== true) throw new PartnersUnavailableError("Partner registration needs its one-time database setup.");
}

/** A repeat unauthenticated request cannot overwrite an existing account or payout contact. */
export async function registerReferralPartner(input: PartnerRegistration) {
  await assertPartnerProgramAvailable();
  const fallback = createPartnerCode(input.partner.businessName, randomBytes(4).toString("hex"));
  const sql = getSql();
  await sql`SELECT register_referral_partner(${randomUUID()}::uuid, ${input.partner.email}, ${input.partner.businessName},
    ${input.preferredCode ?? fallback}, ${fallback}, ${input.termsVersion}, ${input.payoutMethod}, ${input.payoutContact}) AS created`;
}

/** The route supplies an authenticated partner ID; body identifiers never select an account. */
export async function acceptAuthenticatedPartnerTerms(partnerId: string, input: PartnerRegistration) {
  await assertPartnerProgramAvailable();
  const sql = getSql();
  const rows = await sql`SELECT accept_verified_referral_terms(${partnerId}::uuid, ${input.payoutMethod}, ${input.payoutContact}) AS accepted`;
  if (rows[0]?.accepted !== true) throw new PartnerInputError("This account is inactive. Contact PSL support to reopen it.");
}

export async function loadPartnerPayouts(partnerId?: string) {
  await assertPartnerProgramAvailable();
  const sql = getSql();
  const rows = await sql`SELECT id, partner_id, period, amount, method, reference, paid_at FROM partner_referral_payouts
    WHERE (${partnerId ?? null}::uuid IS NULL OR partner_id = ${partnerId ?? null}::uuid) ORDER BY paid_at DESC LIMIT 1000`;
  return rows.map(row => ({ id: String(row.id), partnerId: String(row.partner_id), period: String(row.period),
    amount: Number(row.amount), method: String(row.method), reference: String(row.reference), paidAt: new Date(String(row.paid_at)).toISOString() }));
}

/** Owner-only recipient directory. Never included in another partner's account response. */
export async function loadPartnerPayoutContacts() {
  await assertPartnerProgramAvailable();
  const sql = getSql();
  const rows = await sql`SELECT partner_id, payout_method, payout_contact FROM partner_registration_profiles WHERE email_verified_at IS NOT NULL`;
  return Object.fromEntries(rows.map(row => [String(row.partner_id), { method: String(row.payout_method), contact: String(row.payout_contact) }]));
}

/** Records money the owner has already sent. It never calls a payment provider. */
export async function recordManualPartnerPayout(value: Record<string, unknown>, actor: string) {
  const input = validateManualPayout(value);
  await assertPartnerProgramAvailable();
  const sql = getSql();
  const rows = await sql`SELECT record_manual_referral_payout(${randomUUID()}::uuid, ${input.partnerId}::uuid,
    ${input.orderIds}::text[], ${input.period}, ${input.reference}, ${input.method}, ${input.expectedAmount}, ${actor}) AS recorded`;
  if (rows[0]?.recorded !== true) throw new PartnerInputError("The selected payable orders or amount changed, or a payout was already recorded. Refresh before recording.");
}

export { REFERRAL_PILOT };
