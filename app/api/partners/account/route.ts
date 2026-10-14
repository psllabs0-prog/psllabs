import { NextResponse } from "next/server";
import { authenticatedPartnerId, safePartnerOrderReference } from "@/lib/partners/auth";
import { getPartner } from "@/lib/partners/store";
import { loadReferralPilotDashboard } from "@/lib/partners/referral-store";
import { trackingUrl } from "@/lib/partners/logic";
import { loadPartnerPayouts } from "@/lib/partners/registration-store";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow" };
export async function GET(request: Request) {
  const id = await authenticatedPartnerId(request);
  if (!id) return NextResponse.json({ authenticated: false }, { status: 401, headers });
  try {
    const partner = await getPartner(id);
    if (!partner) return NextResponse.json({ authenticated: false }, { status: 401, headers });
    const pilot = await loadReferralPilotDashboard(id);
    const terms = pilot.terms[id] ?? null;
    const approved = partner.status === "active" && terms?.active === true;
    const codeAvailable = approved && pilot.codesEnabled;
    const rows = pilot.commissions.filter(row => row.partnerId === id);
    const payouts = await loadPartnerPayouts(id);
    const commissions = rows.map(row => ({ reference: safePartnerOrderReference(row.orderId), createdAt: row.createdAt,
      status: row.payoutId ? "paid" : row.status, eligibleProductSubtotal: row.eligibleProductSubtotal, amount: row.amount,
      payableAfter: row.payableAfter, reason: row.payoutId ? "Manual payout recorded." : row.reason,
      items: row.items, paymentMethod: row.paymentMethod,
      paidAt: row.payoutId ? payouts.find(payout => payout.id === row.payoutId)?.paidAt ?? null : null,
      currency: row.currency }));
    const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    return NextResponse.json({ authenticated: true, partner: { name: partner.businessName, status: partner.status,
      code: codeAvailable ? partner.code : null, trackingUrl: codeAvailable ? trackingUrl(partner.code) : null, terms: approved ? terms : null },
      summary: { eligibleOrders: rows.filter(row => row.status !== "ineligible").length,
        heldCommission: money(rows.filter(row => row.status === "held" && !row.payoutId).reduce((sum, row) => sum + row.amount, 0)),
        payableCommission: money(rows.filter(row => row.status === "payable" && !row.payoutId).reduce((sum, row) => sum + row.amount, 0)),
        paidCommission: money(payouts.reduce((sum, row) => sum + row.amount, 0)) },
      commissions, payouts: payouts.map(({ reference, period, amount, paidAt, method }) => ({ reference, period, amount, paidAt, method })),
      codesEnabled: pilot.codesEnabled, automaticPayoutsEnabled: false }, { headers });
  } catch { return NextResponse.json({ error: "Your partner account is temporarily unavailable." }, { status: 503, headers }); }
}
