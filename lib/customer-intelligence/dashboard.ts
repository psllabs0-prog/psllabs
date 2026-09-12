import { runCustomerIntelligenceScan } from "./scan";
import {
  getLatestCustomerIntelSnapshot,
  listCustomerIntelSignals,
  updateCustomerIntelSignalStatus,
} from "./signals-store";
import { ensureCustomerIntelligenceSchema } from "./schema";
import type { CiSignalStatus } from "./taxonomy";

export async function buildCustomerIntelligenceDashboard() {
  await ensureCustomerIntelligenceSchema();
  const [signals, latest] = await Promise.all([
    listCustomerIntelSignals({ limit: 200 }),
    getLatestCustomerIntelSnapshot(),
  ]);

  const evidenceHealth =
    (latest?.snapshot.evidenceHealth as Record<string, number> | undefined) ??
    {};

  const customerSignals = signals.filter((s) => s.evidenceClass === "customer");
  const communitySignals = signals.filter(
    (s) => s.evidenceClass === "community"
  );
  const searchSignals = signals.filter(
    (s) => s.evidenceClass === "search_demand"
  );
  const complianceSignals = signals.filter(
    (s) => s.evidenceClass === "compliance"
  );

  const early = customerSignals.filter(
    (s) =>
      s.confidenceLevel === "early_signal" ||
      s.confidenceLevel === "insufficient"
  );
  const validated = customerSignals.filter(
    (s) =>
      s.confidenceLevel === "meaningful" || s.confidenceLevel === "strong"
  );

  const frictionThemes = new Set([
    "checkout_friction",
    "payment_friction",
    "shipping_question",
    "documentation_question",
    "coa_findability",
    "website_clarity",
    "support_question",
  ]);
  const friction = customerSignals.filter((s) => frictionThemes.has(s.theme));

  const purchaseDrivers = customerSignals.filter(
    (s) => s.signalType === "explicit_purchase_driver"
  );

  const recommendations = signals
    .filter(
      (s) =>
        s.recommendation &&
        s.evidenceClass === "customer" &&
        s.status !== "dismissed" &&
        s.status !== "resolved" &&
        s.theme !== "restricted_human_use_request"
    )
    .map((s) => ({
      id: s.id,
      recommendation: s.recommendation,
      theme: s.theme,
      evidenceClass: s.evidenceClass,
      sampleSize: s.currentCount,
      confidence: s.confidenceLevel,
      evidenceNote: String(s.evidenceJson.note ?? ""),
      areaOwner: ownerForRecommendation(s.recommendation),
    }));

  return {
    evidenceHealth,
    latestSnapshot: latest,
    whatCustomersAreSaying: customerSignals.filter(
      (s) => s.signalType.startsWith("explicit_") || s.evidenceClass === "customer"
    ),
    earlySignals: early,
    validatedSignals: validated,
    friction,
    purchaseDrivers,
    communityQuestions: communitySignals,
    complianceSignals,
    searchDemand: searchSignals,
    recommendations,
    signals,
  };
}

function ownerForRecommendation(rec: string | null): string {
  switch (rec) {
    case "COA_DISCOVERABILITY_REVIEW":
    case "DOCUMENTATION_REVIEW":
    case "CONTENT_OPPORTUNITY_REVIEW":
      return "Authority / Content";
    case "CHECKOUT_FRICTION_REVIEW":
      return "Checkout / Site";
    case "SHIPPING_CLARITY_REVIEW":
      return "Fulfillment / Site";
    case "SUPPORT_KNOWLEDGE_REVIEW":
    case "FAQ_REVIEW":
      return "Support / FAQ";
    case "SITE_COPY_REVIEW":
      return "Website";
    default:
      return "Luke";
  }
}

export async function customerIntelligenceAdminAction(input: {
  action: string;
  signalId?: number;
  status?: CiSignalStatus;
}): Promise<Record<string, unknown>> {
  await ensureCustomerIntelligenceSchema();

  if (input.action === "scan") {
    return runCustomerIntelligenceScan();
  }

  if (
    (input.action === "dismiss" ||
      input.action === "watch" ||
      input.action === "resolve") &&
    input.signalId
  ) {
    const status: CiSignalStatus =
      input.action === "dismiss"
        ? "dismissed"
        : input.action === "watch"
          ? "watch"
          : "resolved";
    const row = await updateCustomerIntelSignalStatus({
      id: input.signalId,
      status,
    });
    return { ok: true, signal: row };
  }

  if (input.action === "export") {
    const dash = await buildCustomerIntelligenceDashboard();
    return {
      ok: true,
      export: {
        generatedAt: new Date().toISOString(),
        evidenceHealth: dash.evidenceHealth,
        recommendations: dash.recommendations,
        validatedSignals: dash.validatedSignals.map((s) => ({
          theme: s.theme,
          count: s.currentCount,
          confidence: s.confidenceLevel,
          evidenceClass: s.evidenceClass,
          note: s.evidenceJson.note,
        })),
        note: "No customer PII / raw Discord IDs included.",
      },
    };
  }

  return { ok: false, error: "Unknown action" };
}
