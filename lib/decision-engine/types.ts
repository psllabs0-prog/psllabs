/**
 * Phase 13 Decision Engine — interpretation layer only.
 * Never a transactional source of truth; never executes business actions.
 */

import type { SourceHealthMap } from "./source-health";
import { emptySourceHealth, markSourceOk } from "./source-health";
export type {
  SourceHealthMap,
  SourceHealthEntry,
  SourceHealthKey,
} from "./source-health";

export type DecisionPriority = "P0" | "P1" | "P2" | "P3";

export type DecisionConfidence =
  | "insufficient"
  | "early"
  | "moderate"
  | "high";

export type DecisionSignalStatus =
  | "active"
  | "acknowledged"
  | "resolved"
  | "dismissed";

export type DecisionOwner =
  | "automation"
  | "luke"
  | "growth_contractor"
  | "content"
  | "research"
  | "regulatory_counsel";

export type DecisionArea =
  | "acquisition"
  | "attribution"
  | "checkout"
  | "finance"
  | "inventory"
  | "fulfillment"
  | "support"
  | "customer_intelligence"
  | "seo"
  | "authority"
  | "discord"
  | "system_health"
  | "data_quality"
  | "regulatory";

export type EvidenceSourceClass =
  | "finance"
  | "orders"
  | "inventory"
  | "support"
  | "customer_feedback"
  | "discord_community"
  | "search_console"
  | "meta"
  | "tiktok"
  | "fulfillment"
  | "system_health"
  | "authority"
  | "customer_intelligence";

export type DecisionEvidenceItem = {
  sourceClass: EvidenceSourceClass;
  label: string;
  detail: string;
};

export type DecisionCandidate = {
  signalKey: string;
  signalType: string;
  area: DecisionArea;
  priority: DecisionPriority;
  confidence: DecisionConfidence;
  title: string;
  /** Short decision statement */
  decision: string;
  summary: string;
  recommendation: string;
  recommendedOwner: DecisionOwner;
  why: string;
  expectedUpside: string;
  mainRisks: string[];
  opportunityCost: string;
  whatCouldMakeWrong: string[];
  dataNeeded: string[];
  nextAction: string;
  evidence: DecisionEvidenceItem[];
  sourceHref: string;
  /** When underlying condition clears, auto-resolve (vs sticky friction). */
  autoResolveWhenGone: boolean;
};

export type DecisionSignalRow = {
  id: number;
  signalKey: string;
  signalType: string;
  area: string;
  priority: DecisionPriority;
  confidence: DecisionConfidence;
  status: DecisionSignalStatus;
  title: string;
  summary: string;
  recommendation: string;
  reasoningJson: Record<string, unknown>;
  evidenceJson: Record<string, unknown>;
  risksJson: Record<string, unknown>;
  whatCouldMakeWrongJson: unknown;
  dataNeededJson: unknown;
  recommendedOwner: DecisionOwner;
  sourceHref: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  dismissedAt: string | null;
  lastNotifiedAt: string | null;
  lastNotifiedEvidenceHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DecisionRunRow = {
  id: number;
  startedAt: string;
  completedAt: string | null;
  status: string;
  sourcesCheckedJson: unknown;
  signalsCreated: number;
  signalsResolved: number;
  errorSummary: string | null;
  createdAt: string;
};

/** Serializable fixture for pure evaluators + tests. */
export type DecisionContext = {
  asOfIso: string;
  /** Completed 7d window (UTC dates YYYY-MM-DD). */
  recentStart: string;
  recentEnd: string;
  priorStart: string;
  priorEnd: string;

  /**
   * Observed completed baseline days available for trend conclusions
   * (sales / paid / fulfillment). Not applied to data-quality or regulatory.
   */
  observedBaselineDays: {
    sales: number;
    paid: number;
    fulfillment: number;
  };

  /** Explicit collection health — never confuse unread with zero. */
  sourceHealth: SourceHealthMap;

  finance: {
    fresh: boolean;
    reconcileFailed: boolean;
    legitimateOrders7d: number;
    legitimateOrdersPrior7d: number;
    grossRevenueUsd7d: number;
    openReconciliationWarnings: number;
    paymentHealthWarnings: number;
    sheetsSyncFailed: number;
  };

  acquisition: {
    metaFresh: boolean;
    tiktokFresh: boolean;
    metaConfigured: boolean;
    tiktokConfigured: boolean;
    spendUsd7d: number;
    clicks7d: number;
    pslAttributedOrders7d: number;
    pslAttributedRevenueUsd7d: number;
    cacUsd: number | null;
    roas: number | null;
    measurementWarnings: string[];
    contributionEconomicsAvailable: boolean;
    funnelDataAvailable: boolean;
  };

  inventory: {
    monitorFresh: boolean;
    skus: Array<{
      sku: string;
      handle: string;
      name: string;
      sellableUnits: number;
      orderedInbound: number;
      inTransit: number;
      awaitingTesting: number;
      inboundPipelineTotal: number;
      forecastConfidence: string;
      statusFlags: string[];
      daysSupply: number | null;
    }>;
  };

  fulfillment: {
    readyOrders: number;
    packingOrReadyBacklog: number;
    holds: number;
    packedWaitingTracking: number;
    slaConfigured: boolean;
  };

  support: {
    genuineMessages7d: number;
    green: number;
    yellow: number;
    red: number;
    unresolvedEscalations: number;
    topCategories: Array<{ category: string; count: number }>;
    failedJobs: number;
  };

  customerIntelligence: {
    signals: Array<{
      signalKey: string;
      theme: string;
      evidenceClass: string;
      currentCount: number;
      confidenceLevel: string;
      recommendation: string | null;
      status: string;
    }>;
  };

  seo: {
    gscFresh: boolean;
    gscConfigured: boolean;
    nonBrandImpressions28d: number;
    nonBrandClicks28d: number;
    materialOpportunity: boolean;
    pagesGaining: string[];
    approvedBriefsWaiting: number;
  };

  discord: {
    enabled: boolean;
    ready: boolean;
    testMode: boolean;
    interactionCount: number;
    restrictedCount: number;
    reportingExcludedOnly: boolean;
  };

  systemHealth: {
    financeJobFailed: boolean;
    sheetsFailed: boolean;
    ceoBriefEmailFailed: boolean;
    supportJobFailed: boolean;
    inventoryMonitorStale: boolean;
    metaStale: boolean;
    gscStale: boolean;
    failureCount: number;
  };
};

export function emptyDecisionContext(asOfIso = new Date().toISOString()): DecisionContext {
  const asOf = new Date(asOfIso);
  const end = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  );
  const recentStart = new Date(end);
  recentStart.setUTCDate(end.getUTCDate() - 7);
  const priorEnd = new Date(recentStart);
  const priorStart = new Date(priorEnd);
  priorStart.setUTCDate(priorEnd.getUTCDate() - 7);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  // Default fixture assumes healthy sources for pure unit tests unless overridden.
  const sourceHealth = emptySourceHealth();
  for (const k of Object.keys(sourceHealth) as Array<keyof typeof sourceHealth>) {
    markSourceOk(sourceHealth, k);
  }

  return {
    asOfIso,
    recentStart: ymd(recentStart),
    recentEnd: ymd(end),
    priorStart: ymd(priorStart),
    priorEnd: ymd(priorEnd),
    observedBaselineDays: {
      sales: 14,
      paid: 14,
      fulfillment: 14,
    },
    sourceHealth,
    finance: {
      fresh: true,
      reconcileFailed: false,
      legitimateOrders7d: 0,
      legitimateOrdersPrior7d: 0,
      grossRevenueUsd7d: 0,
      openReconciliationWarnings: 0,
      paymentHealthWarnings: 0,
      sheetsSyncFailed: 0,
    },
    acquisition: {
      metaFresh: true,
      tiktokFresh: true,
      metaConfigured: false,
      tiktokConfigured: false,
      spendUsd7d: 0,
      clicks7d: 0,
      pslAttributedOrders7d: 0,
      pslAttributedRevenueUsd7d: 0,
      cacUsd: null,
      roas: null,
      measurementWarnings: [],
      contributionEconomicsAvailable: false,
      funnelDataAvailable: false,
    },
    inventory: { monitorFresh: true, skus: [] },
    fulfillment: {
      readyOrders: 0,
      packingOrReadyBacklog: 0,
      holds: 0,
      packedWaitingTracking: 0,
      slaConfigured: false,
    },
    support: {
      genuineMessages7d: 0,
      green: 0,
      yellow: 0,
      red: 0,
      unresolvedEscalations: 0,
      topCategories: [],
      failedJobs: 0,
    },
    customerIntelligence: { signals: [] },
    seo: {
      gscFresh: true,
      gscConfigured: false,
      nonBrandImpressions28d: 0,
      nonBrandClicks28d: 0,
      materialOpportunity: false,
      pagesGaining: [],
      approvedBriefsWaiting: 0,
    },
    discord: {
      enabled: false,
      ready: false,
      testMode: false,
      interactionCount: 0,
      restrictedCount: 0,
      reportingExcludedOnly: false,
    },
    systemHealth: {
      financeJobFailed: false,
      sheetsFailed: false,
      ceoBriefEmailFailed: false,
      supportJobFailed: false,
      inventoryMonitorStale: false,
      metaStale: false,
      gscStale: false,
      failureCount: 0,
    },
  };
}
