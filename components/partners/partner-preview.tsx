"use client";

import styles from "./partner-program.module.css";

export type PartnerRegistration = { name: string; email: string; preferredCode: string; payoutMethod: "zelle" | "arrange"; payoutContact: string };
export type PartnerCommission = { reference: string; createdAt: string; status: string; eligibleProductSubtotal: number; amount: number; payableAfter: string | null; reason: string; items?: { name: string; quantity: number }[]; customerReference?: string; paymentMethod?: string; currency?: string; paidAt?: string | null };
export type PartnerPayout = { reference: string; period: string; amount: number; paidAt: string; method: string };
export type PartnerDashboard = { authenticated: true; partner: { name: string; status: string; code: string | null; trackingUrl: string | null; terms: unknown | null }; summary: { eligibleOrders: number; heldCommission: number; payableCommission: number; paidCommission?: number }; commissions: PartnerCommission[]; payouts?: PartnerPayout[]; preview?: boolean };

const PREVIEW_ACCOUNT_KEY = "psl_partner_isolated_preview_v2";
const PREVIEW_PAYOUT_KEY = "psl_partner_isolated_preview_payout_v2";

export function PartnerPreviewNotice({ children }: { children?: React.ReactNode }) {
  return <aside className={styles.previewNotice}><strong>Isolated preview — no live changes.</strong><p>Registration and orders here are simulations. No verification email, payment, inventory update or advertising event is sent.{children ? <> {children}</> : null}</p></aside>;
}

/** Called only when the server has explicitly enabled the isolated design preview. */
export function createPreviewPartner(input: PartnerRegistration) {
  const preferred = input.preferredCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const generated = input.name.replace(/[^a-z0-9]/gi, "").slice(0, 12).toUpperCase() || "PSLPARTNER";
  const code = preferred || `${generated}${Math.floor(10 + Math.random() * 90)}`;
  sessionStorage.setItem(PREVIEW_ACCOUNT_KEY, JSON.stringify({ ...input, code }));
  sessionStorage.removeItem(PREVIEW_PAYOUT_KEY);
  return code;
}

export function clearPreviewPartner() {
  sessionStorage.removeItem(PREVIEW_ACCOUNT_KEY);
  sessionStorage.removeItem(PREVIEW_PAYOUT_KEY);
}

export function recordPreviewPayout() { sessionStorage.setItem(PREVIEW_PAYOUT_KEY, "recorded"); }

export function getPreviewDashboard(): PartnerDashboard {
  let partner: { name: string; code: string } = { name: "Preview Partner", code: "PSLPREVIEW10" };
  try {
    const raw = sessionStorage.getItem(PREVIEW_ACCOUNT_KEY);
    if (raw) { const parsed = JSON.parse(raw); if (typeof parsed.name === "string" && typeof parsed.code === "string") partner = parsed; }
  } catch { /* An unavailable browser store leaves the isolated example intact. */ }
  const paid = sessionStorage.getItem(PREVIEW_PAYOUT_KEY) === "recorded";
  return {
    authenticated: true, preview: true,
    partner: { name: partner.name, status: "active", code: partner.code, trackingUrl: `/r/${partner.code.toLowerCase()}`, terms: null },
    summary: { eligibleOrders: 3, heldCommission: 10.8, payableCommission: paid ? 0 : 4.75, paidCommission: paid ? 9.25 : 4.5 },
    commissions: [
      { reference: "PREVIEW-1003", createdAt: "2026-10-12T18:00:00Z", status: "held", eligibleProductSubtotal: 107.98, amount: 10.8, payableAfter: "2026-11-15T18:00:00Z", reason: "Sample first order: 10% customer discount, followed by delivery and review hold.", items: [{ name: "Retatrutide · 10 mg", quantity: 2 }], customerReference: "Sample customer C003", paymentMethod: "card", currency: "USD" },
      { reference: "PREVIEW-1002", createdAt: "2026-09-01T18:00:00Z", status: paid ? "paid" : "payable", eligibleProductSubtotal: 47.49, amount: 4.75, payableAfter: "2026-10-05T18:00:00Z", reason: paid ? "Simulated manual payout recorded. No money was transferred." : "Sample repeat order using this code: existing 5% Bitcoin discount applied; delivery, hold and review completed.", items: [{ name: "BPC-157 · 10 mg", quantity: 1 }], customerReference: "Sample customer C002", paymentMethod: "bitcoin", currency: "USD", paidAt: paid ? "2026-10-13T18:00:00Z" : null },
      { reference: "PREVIEW-1001", createdAt: "2026-08-01T18:00:00Z", status: "paid", eligibleProductSubtotal: 44.98, amount: 4.5, payableAfter: "2026-09-05T18:00:00Z", reason: "Sample commission and payout, shown only to preview the history layout.", items: [{ name: "GHK-Cu · 50 mg", quantity: 2 }], customerReference: "Sample customer C001", paymentMethod: "card", currency: "USD", paidAt: "2026-10-01T18:00:00Z" },
    ],
    payouts: [
      ...(paid ? [{ reference: "PREVIEW-PAYOUT-02", period: "September 2026", amount: 4.75, paidAt: "2026-10-13T18:00:00Z", method: "Simulated manual payment" }] : []),
      { reference: "PREVIEW-PAYOUT-01", period: "August 2026", amount: 4.5, paidAt: "2026-10-01T18:00:00Z", method: "Sample manual payment" },
    ],
  };
}
