/**
 * Pure deterministic evaluators — no DB, no LLM.
 * Simulation/replay fixtures call evaluateDecisionPatterns(ctx).
 */

import { confidenceFromCorroboration, evidenceClassesOf } from "./confidence";
import {
  getDecisionFulfillmentBacklogMaterial,
  getDecisionMinOrdersForTrend,
  getDecisionMinPaidClicks,
  getDecisionMinPaidSpendUsd,
  getDecisionMinSeoNonBrandImpressions,
  getDecisionMinSupportCount,
} from "./thresholds";
import type { DecisionCandidate, DecisionContext } from "./types";
import {
  INVENTORY_MOQ,
  PLANNING_LEAD_DAYS,
  REORDER_REVIEW_DAYS,
  TESTING_COST_HIGH_USD,
  TESTING_COST_LOW_USD,
} from "@/lib/inventory/monitor/constants";
import { shouldCreateInventoryRiskLukeAction } from "@/lib/ceo-brief/inventory";

function baseCard(
  partial: Omit<
    DecisionCandidate,
    | "expectedUpside"
    | "opportunityCost"
    | "mainRisks"
    | "whatCouldMakeWrong"
    | "dataNeeded"
    | "nextAction"
  > &
    Partial<
      Pick<
        DecisionCandidate,
        | "expectedUpside"
        | "opportunityCost"
        | "mainRisks"
        | "whatCouldMakeWrong"
        | "dataNeeded"
        | "nextAction"
      >
    >
): DecisionCandidate {
  return {
    expectedUpside: partial.expectedUpside ?? "Clearer owner focus; avoid reacting to noise.",
    opportunityCost:
      partial.opportunityCost ??
      "Time spent here is time not spent on supplier, product, or customer trust work.",
    mainRisks: partial.mainRisks ?? ["Evidence may be incomplete or stale."],
    whatCouldMakeWrong:
      partial.whatCouldMakeWrong ?? [
        "Underlying data may be delayed or misclassified.",
      ],
    dataNeeded:
      partial.dataNeeded ?? ["Confirm source freshness and sample size."],
    nextAction: partial.nextAction ?? partial.recommendation,
    ...partial,
  };
}

/** N. System health / data quality — prefer over performance conclusions. */
function evaluateDataQuality(ctx: DecisionContext): DecisionCandidate[] {
  const out: DecisionCandidate[] = [];

  if (ctx.systemHealth.metaStale && ctx.acquisition.metaConfigured) {
    out.push(
      baseCard({
        signalKey: "data:stale:meta",
        signalType: "SOURCE_STALE",
        area: "data_quality",
        priority: "P1",
        confidence: "moderate",
        title: "Meta acquisition data is stale",
        decision: "Do not judge paid performance until Meta sync is current.",
        summary:
          "Paid Meta sync appears stale. Performance conclusions are blocked.",
        recommendation:
          "Restore Meta sync health before scaling, pausing, or comparing campaigns.",
        recommendedOwner: "luke",
        why: "Missing/stale connector data must not become a business-performance conclusion.",
        evidence: [
          {
            sourceClass: "meta",
            label: "Sync freshness",
            detail: "Meta last sync exceeds freshness gate",
          },
          {
            sourceClass: "system_health",
            label: "Data quality",
            detail: "SOURCE_STALE: meta",
          },
        ],
        sourceHref: "/admin-acquisition",
        autoResolveWhenGone: true,
        nextAction: "Check paid acquisition sync / Meta connector.",
      })
    );
  }

  if (ctx.systemHealth.gscStale && ctx.seo.gscConfigured) {
    out.push(
      baseCard({
        signalKey: "data:stale:gsc",
        signalType: "SOURCE_STALE",
        area: "data_quality",
        priority: "P2",
        confidence: "moderate",
        title: "Search Console data is stale",
        decision: "Do not conclude SEO visibility fell from stale GSC data.",
        summary: "GSC sync is stale; SEO decline/opportunity conclusions blocked.",
        recommendation: "Restore Search Console sync before SEO decisions.",
        recommendedOwner: "luke",
        why: "Stale Search Console must not invent visibility declines.",
        evidence: [
          {
            sourceClass: "search_console",
            label: "Sync freshness",
            detail: "GSC last successful sync exceeds freshness gate",
          },
        ],
        sourceHref: "/admin-intelligence",
        autoResolveWhenGone: true,
      })
    );
  }

  if (ctx.systemHealth.inventoryMonitorStale || !ctx.inventory.monitorFresh) {
    out.push(
      baseCard({
        signalKey: "data:stale:inventory",
        signalType: "SOURCE_STALE",
        area: "data_quality",
        priority: "P1",
        confidence: "moderate",
        title: "Inventory monitor data is stale",
        decision: "Do not conclude current stock coverage from a stale monitor.",
        summary: "Inventory monitor snapshot is stale.",
        recommendation: "Restore inventory monitor cron before coverage decisions.",
        recommendedOwner: "luke",
        why: "Coverage conclusions require a fresh monitor snapshot.",
        evidence: [
          {
            sourceClass: "inventory",
            label: "Monitor freshness",
            detail: "inventory_monitor snapshot older than freshness gate",
          },
        ],
        sourceHref: "/admin-inventory",
        autoResolveWhenGone: true,
      })
    );
  }

  if (ctx.finance.reconcileFailed || !ctx.finance.fresh) {
    out.push(
      baseCard({
        signalKey: "data:quality:finance",
        signalType: "DATA_QUALITY",
        area: "data_quality",
        priority: "P0",
        confidence: "moderate",
        title: "Finance reconciliation not fully trusted",
        decision:
          "Treat financial totals as provisional until reconciliation is healthy.",
        summary: "Finance job failed or finance freshness gate failed.",
        recommendation:
          "Restore finance reconciliation / Sheets integrity before business decisions that depend on revenue or orders.",
        recommendedOwner: "luke",
        why: "Untrusted finance must lower confidence in order/revenue conclusions.",
        evidence: [
          {
            sourceClass: "finance",
            label: "Reconciliation",
            detail: ctx.finance.reconcileFailed
              ? "Latest finance reconciliation job failed"
              : "Finance freshness gate failed",
          },
        ],
        sourceHref: "/admin-finance",
        autoResolveWhenGone: true,
        nextAction: "Open /admin-finance and clear reconciliation failures.",
      })
    );
  }

  if (ctx.systemHealth.failureCount >= 3) {
    out.push(
      baseCard({
        signalKey: "system:health:multi_failure",
        signalType: "SYSTEM_HEALTH_RISK",
        area: "system_health",
        priority: "P0",
        confidence: "moderate",
        title: "Multiple automation / data systems need attention",
        decision:
          "Restore data integrity before making cross-business performance decisions.",
        summary: `${ctx.systemHealth.failureCount} material system-health issues detected.`,
        recommendation:
          "Stabilize finance, Sheets, syncs, and CEO brief delivery before optimizing growth.",
        recommendedOwner: "luke",
        why: "Correlated automation failures raise the cost of acting on stale conclusions.",
        evidence: [
          {
            sourceClass: "system_health",
            label: "Failure count",
            detail: `${ctx.systemHealth.failureCount} material health flags`,
          },
        ],
        sourceHref: "/admin-ops",
        autoResolveWhenGone: true,
      })
    );
  }

  return out;
}

/** A. Acquisition + attribution break */
function evaluateAttributionBreak(ctx: DecisionContext): DecisionCandidate[] {
  const minSpend = getDecisionMinPaidSpendUsd();
  const paidFresh =
    (!ctx.acquisition.metaConfigured ||
      (ctx.acquisition.metaFresh && !ctx.systemHealth.metaStale)) &&
    (!ctx.acquisition.tiktokConfigured || ctx.acquisition.tiktokFresh);

  if (!paidFresh) return []; // data quality handles stale
  if (ctx.systemHealth.metaStale && ctx.acquisition.metaConfigured) return [];
  if (ctx.acquisition.spendUsd7d < minSpend) return [];
  if (ctx.acquisition.clicks7d < getDecisionMinPaidClicks() / 2) return [];

  const hasWarning = ctx.acquisition.measurementWarnings.length > 0;
  const zeroOrders = ctx.acquisition.pslAttributedOrders7d === 0;

  if (!hasWarning && !(zeroOrders && ctx.acquisition.clicks7d >= getDecisionMinPaidClicks())) {
    return [];
  }

  if (!zeroOrders && !hasWarning) return [];

  return [
    baseCard({
      signalKey: "acquisition:attribution_break",
      signalType: "ATTRIBUTION_MEASUREMENT",
      area: "attribution",
      priority: "P1",
      confidence: confidenceFromCorroboration({
        evidenceClasses: ["meta", "orders", "system_health"],
        sampleHint: ctx.acquisition.spendUsd7d >= minSpend * 2 ? "adequate" : "small",
        dataFresh: paidFresh,
      }),
      title: "Paid measurement / attribution needs review first",
      decision:
        "Investigate attribution and tracking before judging campaign performance.",
      summary:
        "Paid spend/clicks exist while PSL attributed orders are absent or measurement warnings are present.",
      recommendation:
        "Investigate attribution/tracking before scaling or pausing campaigns. Do not treat platform ROAS as profit.",
      recommendedOwner: "luke",
      why: "Available data is consistent with a measurement break or unpaid conversion path — not proof of creative failure.",
      evidence: [
        {
          sourceClass: "meta",
          label: "Paid spend (7d)",
          detail: `$${ctx.acquisition.spendUsd7d.toFixed(2)} spend · ${ctx.acquisition.clicks7d} clicks`,
        },
        {
          sourceClass: "orders",
          label: "PSL attributed orders (7d)",
          detail: `${ctx.acquisition.pslAttributedOrders7d}`,
        },
        ...(ctx.acquisition.measurementWarnings[0]
          ? [
              {
                sourceClass: "system_health" as const,
                label: "Measurement warning",
                detail: ctx.acquisition.measurementWarnings[0].slice(0, 200),
              },
            ]
          : []),
      ],
      mainRisks: [
        "ROAS is not profit.",
        "Platform purchase counts may disagree with PSL internal truth.",
      ],
      whatCouldMakeWrong: [
        "Spend window may not yet include delayed conversions.",
        "Attribution windows may be incomplete.",
      ],
      dataNeeded: [
        "Confirm Meta/TikTok sync freshness",
        "Confirm PSL order UTM / referral capture",
      ],
      sourceHref: "/admin-acquisition",
      autoResolveWhenGone: true,
      nextAction: "Open acquisition + attribution admins; verify tracking before performance calls.",
    }),
  ];
}

/** B. Paid traffic without commercial progression — only if funnel data exists */
function evaluatePaidWithoutProgression(
  ctx: DecisionContext
): DecisionCandidate[] {
  if (!ctx.acquisition.funnelDataAvailable) return [];
  // Funnel remains unavailable in V1 — never fabricate.
  return [];
}

/** C. Payment / checkout discontinuity */
function evaluateCheckoutDiscontinuity(
  ctx: DecisionContext
): DecisionCandidate[] {
  if (!ctx.finance.fresh || ctx.finance.reconcileFailed) return [];
  if (ctx.finance.paymentHealthWarnings < 2) return [];
  if (ctx.finance.legitimateOrders7d >= getDecisionMinOrdersForTrend()) return [];

  // Need corroboration: open recon warnings that look payment-related
  if (ctx.finance.openReconciliationWarnings < 1) return [];

  return [
    baseCard({
      signalKey: "checkout:payment_discontinuity",
      signalType: "PAYMENT_CHECKOUT",
      area: "checkout",
      priority: "P0",
      confidence: "early",
      title: "Payment / checkout path may need review",
      decision:
        "Prioritize payment and checkout integrity over marketing optimization.",
      summary:
        "Multiple payment/reconciliation warnings with limited successful legitimate orders.",
      recommendation:
        "Review payment provider health and checkout path. Do not infer failure from a single declined card.",
      recommendedOwner: "luke",
      why: "Server-side reconciliation warnings corroborate checkout friction better than ad metrics alone.",
      evidence: [
        {
          sourceClass: "finance",
          label: "Payment-related warnings",
          detail: `${ctx.finance.paymentHealthWarnings} payment-health style warning(s)`,
        },
        {
          sourceClass: "orders",
          label: "Legitimate orders (7d)",
          detail: `${ctx.finance.legitimateOrders7d}`,
        },
      ],
      sourceHref: "/admin-finance",
      autoResolveWhenGone: true,
    }),
  ];
}

/** D + E. Inventory demand / testing bottleneck */
function evaluateInventory(ctx: DecisionContext): DecisionCandidate[] {
  const out: DecisionCandidate[] = [];
  if (!ctx.inventory.monitorFresh) return out;

  for (const sku of ctx.inventory.skus) {
    const risk = shouldCreateInventoryRiskLukeAction(sku);
    if (risk) {
      out.push(
        baseCard({
          signalKey: `inventory:risk:${sku.sku}`,
          signalType: "INVENTORY_DEMAND_RISK",
          area: "inventory",
          priority: "P1",
          confidence:
            sku.forecastConfidence === "RELIABLE" ? "moderate" : "early",
          title: `Inventory reorder review: ${sku.name}`,
          decision: "REORDER REVIEW — Luke remains the purchaser.",
          summary: `Sellable ${sku.sellableUnits}; inbound pipeline ${sku.inboundPipelineTotal}; flags ${sku.statusFlags.join(", ") || "n/a"}.`,
          recommendation: `REORDER REVIEW for ${sku.sku}. Do not place a PO because MOQ is ${INVENTORY_MOQ}. Account for ~${PLANNING_LEAD_DAYS}d lead / ~${REORDER_REVIEW_DAYS}d review and ~$${TESTING_COST_LOW_USD}–$${TESTING_COST_HIGH_USD} testing.`,
          recommendedOwner: "luke",
          why: "Validated demand with constrained sellable coverage and insufficient inbound for the planning horizon.",
          evidence: [
            {
              sourceClass: "inventory",
              label: "Sellable + inbound",
              detail: `sellable=${sku.sellableUnits}, inbound=${sku.inboundPipelineTotal}, confidence=${sku.forecastConfidence}`,
            },
          ],
          mainRisks: [
            "MOQ alone must never create a place-order action.",
            "Shelf life and testing turnaround may change the lot size choice.",
          ],
          whatCouldMakeWrong: [
            "Demand may be a short spike rather than sustained velocity.",
            "Inbound lots may be closer to release than recorded.",
          ],
          dataNeeded: [
            "Confirm latest inventory monitor snapshot",
            "Confirm inbound lot statuses",
          ],
          sourceHref: "/admin-inventory",
          autoResolveWhenGone: true,
          nextAction: `Review inventory plan for ${sku.sku} — REORDER REVIEW only.`,
        })
      );
    }

    // Explicit counterexample path is handled by shouldCreateInventoryRiskLukeAction
    // (Tesa 9 + inbound 30 + unvalidated => no signal).

    if (
      sku.awaitingTesting > 0 &&
      sku.forecastConfidence === "RELIABLE" &&
      sku.sellableUnits <= 15 &&
      sku.statusFlags.some((f) =>
        ["REORDER_REVIEW", "DEPLETION_WATCH", "ABSOLUTE_LOW_STOCK"].includes(f)
      )
    ) {
      out.push(
        baseCard({
          signalKey: `inventory:testing_bottleneck:${sku.sku}`,
          signalType: "TESTING_RELEASE_REVIEW",
          area: "inventory",
          priority: "P2",
          confidence: "early",
          title: `Testing / release review: ${sku.name}`,
          decision: "Prioritize testing/release review — do not auto-release.",
          summary: `${sku.awaitingTesting} unit(s) awaiting testing while sellable coverage is constrained.`,
          recommendation:
            "Prioritize testing/release review. Do not release inventory automatically.",
          recommendedOwner: "luke",
          why: "Demand appears validated while units sit in received_awaiting_testing.",
          evidence: [
            {
              sourceClass: "inventory",
              label: "Awaiting testing",
              detail: `${sku.awaitingTesting} units awaiting testing; sellable ${sku.sellableUnits}`,
            },
          ],
          sourceHref: "/admin-inventory",
          autoResolveWhenGone: true,
        })
      );
    }
  }

  return out;
}

/** F. Fulfillment bottleneck */
function evaluateFulfillment(ctx: DecisionContext): DecisionCandidate[] {
  const material = getDecisionFulfillmentBacklogMaterial();
  const out: DecisionCandidate[] = [];

  // Normal ready queue is not a crisis
  if (ctx.fulfillment.holds >= 3) {
    out.push(
      baseCard({
        signalKey: "fulfillment:holds",
        signalType: "FULFILLMENT_HOLDS",
        area: "fulfillment",
        priority: "P1",
        confidence: "early",
        title: "Fulfillment holds need owner review",
        decision: "Clear real holds before treating packing volume as the problem.",
        summary: `${ctx.fulfillment.holds} order hold(s) currently open.`,
        recommendation: "Review hold reasons and finance blockers on held orders.",
        recommendedOwner: "luke",
        why: "Accumulated holds can block customer delivery independently of packing capacity.",
        evidence: [
          {
            sourceClass: "fulfillment",
            label: "Holds",
            detail: `${ctx.fulfillment.holds} holds`,
          },
        ],
        sourceHref: "/admin-fulfillment",
        autoResolveWhenGone: true,
      })
    );
  }

  if (
    ctx.fulfillment.packingOrReadyBacklog >= material &&
    ctx.finance.legitimateOrders7d >= getDecisionMinOrdersForTrend()
  ) {
    const slaNote = ctx.fulfillment.slaConfigured
      ? "Compare against configured SLA."
      : "No fulfillment SLA configured — report backlog factually only (do not invent missed-SLA claims).";
    out.push(
      baseCard({
        signalKey: "fulfillment:backlog",
        signalType: "FULFILLMENT_BACKLOG",
        area: "fulfillment",
        priority: "P2",
        confidence: "early",
        title: "Fulfillment backlog is elevated",
        decision: "Review packing capacity against recent legitimate order volume.",
        summary: `Ready/packing backlog ${ctx.fulfillment.packingOrReadyBacklog}. ${slaNote}`,
        recommendation: "Review warehouse queue; do not treat normal daily packing as a crisis.",
        recommendedOwner: "luke",
        why: "Legitimate order volume rose alongside a material ready/packing backlog.",
        evidence: [
          {
            sourceClass: "fulfillment",
            label: "Backlog",
            detail: `ready/packing=${ctx.fulfillment.packingOrReadyBacklog}`,
          },
          {
            sourceClass: "orders",
            label: "Legitimate orders (7d)",
            detail: `${ctx.finance.legitimateOrders7d}`,
          },
        ],
        sourceHref: "/admin-fulfillment",
        autoResolveWhenGone: true,
      })
    );
  }

  return out;
}

/** G/H/I/L Customer intelligence friction patterns */
function evaluateCustomerFriction(ctx: DecisionContext): DecisionCandidate[] {
  const out: DecisionCandidate[] = [];
  const minSupport = getDecisionMinSupportCount();
  const signals = ctx.customerIntelligence.signals.filter(
    (s) => s.status !== "resolved" && s.status !== "dismissed"
  );

  // Restricted human-use → regulatory / compliance only
  const restricted = signals.filter(
    (s) =>
      s.theme === "restricted_human_use_request" ||
      s.evidenceClass === "compliance"
  );
  const restrictedCount = restricted.reduce((n, s) => n + s.currentCount, 0);
  if (restrictedCount >= minSupport) {
    out.push(
      baseCard({
        signalKey: "regulatory:human_use_trend",
        signalType: "REGULATORY_CLAIMS_REVIEW",
        area: "regulatory",
        priority: "P1",
        confidence: "early",
        title: "Restricted human-use / claims review",
        decision: "Route to regulatory counsel / Luke — no marketing optimization.",
        summary: "Repeated restricted human-use or claims-sensitive interactions.",
        recommendation:
          "REGULATORY / CLAIMS REVIEW. Do not create marketing or content opportunities from this signal.",
        recommendedOwner: "regulatory_counsel",
        why: "Claims and intended-use risk must not be treated as conversion optimization.",
        evidence: [
          {
            sourceClass: "customer_intelligence",
            label: "Compliance observations",
            detail: `${restrictedCount} restricted/compliance observations (aggregate)`,
          },
        ],
        sourceHref: "/admin-customer-intelligence",
        autoResolveWhenGone: false,
      })
    );
  }

  const coaCustomer = signals.filter(
    (s) =>
      s.theme === "coa_findability" && s.evidenceClass === "customer"
  );
  const coaCommunity = signals.filter(
    (s) =>
      s.theme === "coa_findability" && s.evidenceClass === "community"
  );
  const coaSearch = signals.filter(
    (s) =>
      s.theme === "coa_findability" && s.evidenceClass === "search_demand"
  );
  const supportCoa = ctx.support.topCategories.find((c) =>
    /coa|documentation|batch|lab.?report/i.test(c.category)
  );

  const customerN = coaCustomer.reduce((n, s) => n + s.currentCount, 0);
  const communityN = coaCommunity.reduce((n, s) => n + s.currentCount, 0);
  const searchPresent = coaSearch.length > 0;
  const supportN = supportCoa?.count ?? 0;

  const classes: string[] = [];
  if (customerN >= minSupport || supportN >= minSupport) classes.push("support");
  if (customerN > 0) classes.push("customer_intelligence");
  if (communityN > 0) classes.push("discord_community");
  if (searchPresent) classes.push("search_console");
  if (coaCustomer.some((s) => s.evidenceClass === "customer")) {
    /* already */
  }

  // Feedback purchase drivers handled via theme purchase_driver in CI if present
  const trustFeedback = signals.filter(
    (s) =>
      /testing|documentation|transparency|coa/i.test(s.theme) &&
      s.evidenceClass === "customer" &&
      /purchase|trust|driver/i.test(s.signalKey + s.theme)
  );

  if (
    customerN + supportN >= minSupport &&
    (communityN > 0 || searchPresent || customerN >= minSupport)
  ) {
    const evidence = [
      ...(customerN > 0
        ? [
            {
              sourceClass: "customer_intelligence" as const,
              label: "Customer COA evidence",
              detail: `${customerN} customer-class observations (not merged with other classes)`,
            },
          ]
        : []),
      ...(supportN > 0
        ? [
            {
              sourceClass: "support" as const,
              label: "Support category",
              detail: `${supportCoa!.category}: ${supportN}`,
            },
          ]
        : []),
      ...(communityN > 0
        ? [
            {
              sourceClass: "discord_community" as const,
              label: "Community COA questions",
              detail: `${communityN} community-class observations`,
            },
          ]
        : []),
      ...(searchPresent
        ? [
            {
              sourceClass: "search_console" as const,
              label: "Search-demand COA theme",
              detail: "Query-specific search_demand evidence present",
            },
          ]
        : []),
    ];
    const conf = confidenceFromCorroboration({
      evidenceClasses: evidenceClassesOf(evidence),
      sampleHint:
        customerN + supportN >= minSupport * 2 ? "adequate" : "small",
      dataFresh: true,
    });
    out.push(
      baseCard({
        signalKey: "friction:coa_documentation",
        signalType: "COA_FRICTION",
        area: "customer_intelligence",
        priority: conf === "moderate" || conf === "high" ? "P2" : "P3",
        confidence: conf,
        title: "COA / documentation discoverability friction",
        decision: "Review COA discoverability / FAQ / internal links.",
        summary:
          "Multiple evidence classes are consistent with COA/documentation findability friction. Sample sizes are not merged.",
        recommendation:
          "Review COA discoverability, FAQ clarity, and internal links. Do not automatically rewrite site content.",
        recommendedOwner: "content",
        why: "Corroborated friction across independent classes increases confidence without adding counts together.",
        evidence,
        sourceHref: "/admin-customer-intelligence",
        autoResolveWhenGone: false,
      })
    );
  }

  const shippingCat = ctx.support.topCategories.find((c) =>
    /ship/i.test(c.category)
  );
  if ((shippingCat?.count ?? 0) >= minSupport) {
    out.push(
      baseCard({
        signalKey: "friction:shipping_clarity",
        signalType: "SHIPPING_CLARITY",
        area: "support",
        priority: "P3",
        confidence: "early",
        title: "Shipping clarity friction",
        decision: "Clarity review only — do not change published policy automatically.",
        summary: `${shippingCat!.count} legitimate shipping-category support messages.`,
        recommendation: "Review shipping FAQ/clarity. Do not change published policy from this signal alone.",
        recommendedOwner: "luke",
        why: "Repeated legitimate shipping questions may indicate clarity gaps.",
        evidence: [
          {
            sourceClass: "support",
            label: "Shipping category",
            detail: `${shippingCat!.count} messages`,
          },
        ],
        sourceHref: "/admin-support",
        autoResolveWhenGone: false,
      })
    );
  }

  if (trustFeedback.length > 0 && trustFeedback[0].currentCount >= 2) {
    out.push(
      baseCard({
        signalKey: "trust:explicit_testing_driver",
        signalType: "CUSTOMER_TRUST_SIGNAL",
        area: "customer_intelligence",
        priority: "P3",
        confidence: "early",
        title: "Explicit testing/documentation trust signal",
        decision:
          "Note explicit purchase-driver feedback — do not invent promotional claims.",
        summary:
          "Customers explicitly selected testing/documentation/transparency as a purchase driver.",
        recommendation:
          "Preserve analytical credibility. Do not convert into unsupported promotional claims.",
        recommendedOwner: "luke",
        why: "Trust must be based on explicit feedback — never inferred from purchase alone.",
        evidence: [
          {
            sourceClass: "customer_feedback",
            label: "Explicit purchase driver",
            detail: `${trustFeedback[0].currentCount} explicit feedback observations`,
          },
        ],
        sourceHref: "/admin-customer-intelligence",
        autoResolveWhenGone: false,
      })
    );
  }

  // L. Support burden from specific friction
  const top = ctx.support.topCategories[0];
  if (
    top &&
    top.count >= minSupport * 2 &&
    ctx.support.genuineMessages7d >= minSupport * 2
  ) {
    const ciMatch = signals.find(
      (s) =>
        s.evidenceClass === "customer" &&
        s.currentCount >= minSupport &&
        (s.theme.includes(top.category.split("_")[0] ?? "") ||
          top.category.includes("coa"))
    );
    if (ciMatch || /coa|ship|payment|order_status/i.test(top.category)) {
      out.push(
        baseCard({
          signalKey: `support:burden:${top.category}`,
          signalType: "SUPPORT_BURDEN",
          area: "support",
          priority: "P2",
          confidence: "early",
          title: `Support burden: ${top.category}`,
          decision: "Fix root cause instead of only answering more emails.",
          summary: `${top.count} legitimate messages in category ${top.category}.`,
          recommendation: "Investigate root cause of recurring legitimate category.",
          recommendedOwner: "luke",
          why: "Volume plus category concentration is consistent with preventable friction.",
          evidence: [
            {
              sourceClass: "support",
              label: "Category volume",
              detail: `${top.category}: ${top.count}`,
            },
          ],
          sourceHref: "/admin-support",
          autoResolveWhenGone: false,
        })
      );
    }
  }

  return out;
}

/** J. SEO authority opportunity corroborated by customers */
function evaluateSeoAuthority(ctx: DecisionContext): DecisionCandidate[] {
  if (!ctx.seo.gscFresh || !ctx.seo.gscConfigured) return [];
  const minImp = getDecisionMinSeoNonBrandImpressions();
  if (ctx.seo.nonBrandImpressions28d < minImp) return [];
  if (!ctx.seo.materialOpportunity) return [];

  const customerQs = ctx.customerIntelligence.signals.filter(
    (s) =>
      s.evidenceClass === "customer" &&
      s.currentCount >= getDecisionMinSupportCount() &&
      /analytical|coa|purity|identity|testing/i.test(s.theme)
  );
  if (customerQs.length === 0 && ctx.support.genuineMessages7d < getDecisionMinSupportCount()) {
    // SEO-only weak — skip strong decision; tiny changes already gated by materialOpportunity + min impressions
    return [];
  }

  return [
    baseCard({
      signalKey: "seo:authority_opportunity",
      signalType: "AUTHORITY_OPPORTUNITY_REVIEW",
      area: "authority",
      priority: "P3",
      confidence: confidenceFromCorroboration({
        evidenceClasses: ["search_console", "customer_intelligence"],
        sampleHint: "small",
        dataFresh: ctx.seo.gscFresh,
      }),
      title: "Authority opportunity corroborated by customer questions",
      decision: "Review Authority opportunity — do not auto-approve or publish.",
      summary:
        "Non-brand visibility plus legitimate analytical/customer questions are consistent with an authority content opportunity.",
      recommendation:
        "Review Authority opportunity. Do NOT automatically create, approve, or publish content.",
      recommendedOwner: "content",
      why: "Corroboration raises review priority; publication remains a human decision.",
      evidence: [
        {
          sourceClass: "search_console",
          label: "Non-brand impressions (28d)",
          detail: `${ctx.seo.nonBrandImpressions28d}`,
        },
        {
          sourceClass: "customer_intelligence",
          label: "Customer analytical themes",
          detail: `${customerQs.length} customer signal(s) with adequate count`,
        },
      ],
      sourceHref: "/admin-authority",
      autoResolveWhenGone: false,
    }),
  ];
}

/** K. Paid demand + inventory constraint */
function evaluatePaidInventoryConstraint(
  ctx: DecisionContext
): DecisionCandidate[] {
  const minOrders = getDecisionMinOrdersForTrend();
  if (ctx.acquisition.pslAttributedOrders7d < minOrders) return [];
  if (!ctx.inventory.monitorFresh) return [];
  if (!ctx.acquisition.metaFresh && ctx.acquisition.metaConfigured) return [];

  const constrained = ctx.inventory.skus.find(
    (s) =>
      shouldCreateInventoryRiskLukeAction(s) ||
      (s.forecastConfidence === "RELIABLE" &&
        s.sellableUnits <= 5 &&
        s.inboundPipelineTotal === 0)
  );
  if (!constrained) return [];

  return [
    baseCard({
      signalKey: `acquisition:inventory_constraint:${constrained.sku}`,
      signalType: "PAID_INVENTORY_CONSTRAINT",
      area: "acquisition",
      priority: "P1",
      confidence: "early",
      title: "Paid demand meeting inventory constraint",
      decision: "Review acquisition pacing AND inventory plan together.",
      summary: `Attributed paid orders ${ctx.acquisition.pslAttributedOrders7d} with constrained sellable coverage on ${constrained.sku}.`,
      recommendation:
        "Review acquisition pacing and inventory plan. Do not change ad budget automatically.",
      recommendedOwner: "luke",
      why: "Validated paid demand with constrained coverage may indicate pacing/inventory tension — not an auto budget change.",
      evidence: [
        {
          sourceClass: "orders",
          label: "PSL attributed orders",
          detail: `${ctx.acquisition.pslAttributedOrders7d}`,
        },
        {
          sourceClass: "inventory",
          label: "SKU coverage",
          detail: `${constrained.sku} sellable=${constrained.sellableUnits} inbound=${constrained.inboundPipelineTotal}`,
        },
      ],
      sourceHref: "/admin-decisions",
      autoResolveWhenGone: true,
    }),
  ];
}

/** M. Data conflict — platform vs internal */
function evaluateDataConflict(ctx: DecisionContext): DecisionCandidate[] {
  if (ctx.acquisition.measurementWarnings.length === 0) return [];
  if (ctx.acquisition.spendUsd7d < getDecisionMinPaidSpendUsd()) return [];
  const mismatch = ctx.acquisition.measurementWarnings.some((w) =>
    /mismatch|ambiguous|no matched|without platform/i.test(w)
  );
  if (!mismatch) return [];

  return [
    baseCard({
      signalKey: "data:conflict:platform_vs_psl",
      signalType: "DATA_CONFLICT",
      area: "data_quality",
      priority: "P1",
      confidence: "early",
      title: "Platform vs PSL purchase measurement conflict",
      decision:
        "Investigate measurement integrity. Internal PSL transactional truth remains authoritative.",
      summary: "Platform reporting materially disagrees with PSL attributed orders.",
      recommendation:
        "Investigate measurement/data integrity before performance optimization.",
      recommendedOwner: "luke",
      why: "Conflicts are measurement problems first — not creative or budget problems.",
      evidence: [
        {
          sourceClass: "system_health",
          label: "Measurement warning",
          detail: ctx.acquisition.measurementWarnings[0].slice(0, 200),
        },
        {
          sourceClass: "orders",
          label: "PSL attributed orders",
          detail: `${ctx.acquisition.pslAttributedOrders7d}`,
        },
      ],
      sourceHref: "/admin-attribution",
      autoResolveWhenGone: true,
    }),
  ];
}

/** Discord restricted trend — compliance only */
function evaluateDiscord(ctx: DecisionContext): DecisionCandidate[] {
  if (!ctx.discord.enabled) return [];
  // TEST interactions excluded via reportingExcluded / analytics already
  if (ctx.discord.interactionCount < 20) return [];
  const rate = ctx.discord.restrictedCount / ctx.discord.interactionCount;
  if (rate <= 0.5) return [];

  return [
    baseCard({
      signalKey: "discord:restricted_trend",
      signalType: "REGULATORY_CLAIMS_REVIEW",
      area: "discord",
      priority: "P2",
      confidence: "early",
      title: "Discord restricted-request trend",
      decision: "Compliance review only — no marketing recommendation.",
      summary: `Restricted share ${(rate * 100).toFixed(0)}% of ${ctx.discord.interactionCount} interactions.`,
      recommendation:
        "Monitor Discord restricted boundary responses. Do not create marketing content from this.",
      recommendedOwner: "regulatory_counsel",
      why: "Elevated restricted requests are a compliance signal, not a growth opportunity.",
      evidence: [
        {
          sourceClass: "discord_community",
          label: "Restricted rate",
          detail: `${ctx.discord.restrictedCount}/${ctx.discord.interactionCount}`,
        },
      ],
      sourceHref: "/admin-discord",
      autoResolveWhenGone: false,
    }),
  ];
}

/**
 * Evaluate all Phase 13 patterns against a serializable context.
 * Dedupes by signalKey (first / higher priority wins).
 */
export function evaluateDecisionPatterns(
  ctx: DecisionContext
): DecisionCandidate[] {
  const raw = [
    ...evaluateDataQuality(ctx),
    ...evaluateAttributionBreak(ctx),
    ...evaluatePaidWithoutProgression(ctx),
    ...evaluateCheckoutDiscontinuity(ctx),
    ...evaluateInventory(ctx),
    ...evaluateFulfillment(ctx),
    ...evaluateCustomerFriction(ctx),
    ...evaluateSeoAuthority(ctx),
    ...evaluatePaidInventoryConstraint(ctx),
    ...evaluateDataConflict(ctx),
    ...evaluateDiscord(ctx),
  ];

  // Drop insufficient confidence noise (except P0 data quality)
  const filtered = raw.filter(
    (c) =>
      c.confidence !== "insufficient" ||
      c.priority === "P0" ||
      c.signalType === "SOURCE_STALE" ||
      c.signalType === "DATA_QUALITY"
  );

  const byKey = new Map<string, DecisionCandidate>();
  for (const c of filtered) {
    const prev = byKey.get(c.signalKey);
    if (!prev) {
      byKey.set(c.signalKey, c);
      continue;
    }
    // Keep higher priority
    const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
    if (order[c.priority] < order[prev.priority]) byKey.set(c.signalKey, c);
  }
  return [...byKey.values()];
}
