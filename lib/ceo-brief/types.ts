export type CeoBriefSectionKey =
  | "executive"
  | "sales"
  | "acquisition"
  | "inventory"
  | "support"
  | "seo"
  | "health"
  | "fulfillment"
  | "actions";

export type DataAvailability = "known" | "insufficient" | "warning";

export type CeoLukeAction = {
  rank: number;
  action: string;
  why: string;
  urgency: string | null;
};

export type CeoSalesSnapshot = {
  periodLabel: string;
  priorPeriodLabel: string;
  legitimateOrders: number;
  priorLegitimateOrders: number;
  grossRevenueUsd: number;
  priorGrossRevenueUsd: number;
  /** Null when processor fees / net not reliably available. */
  netBusinessRevenueUsd: number | null;
  unitsSold: number;
  priorUnitsSold: number;
  aovUsd: number | null;
  priorAovUsd: number | null;
  revenueBySku: Array<{
    handle: string;
    sku: string;
    units: number;
    revenueUsd: number | null;
  }>;
  paymentMethodMix: Array<{ method: string; orders: number; revenueUsd: number }>;
  refundsUsd: number | null;
  refundsNote: string;
  reconciliationWarnings: Array<{ type: string; message: string; orderId: string | null }>;
  ordersChangeNote: string | null;
  revenueChangeNote: string | null;
};

export type CeoAcquisitionSnapshot = {
  status: "available" | "unavailable";
  message: string;
  spendUsd: number | null;
  sessionsOrClicks: number | null;
  attributedOrders: number | null;
  attributedRevenueUsd: number | null;
  cacUsd: number | null;
  roas: number | null;
  winners: string[];
  losers: string[];
  /** Measurement warnings only — not automatic performance failures. */
  measurementWarnings?: string[];
  /** Top campaign label when evidence thresholds are met; otherwise null. */
  topCampaign?: string | null;
  contributionEconomics?: "insufficient data";
};

export type CeoInventorySkuRow = {
  handle: string;
  sku: string;
  name: string;
  sellableUnits: number;
  orderedInbound: number;
  inTransit: number;
  awaitingTesting: number;
  /** ordered + in_transit + awaiting_testing (never sellable). */
  inboundPipelineTotal: number;
  forecastConfidence: string;
  statusFlags: string[];
  expectedReleaseDates: string[];
};

export type CeoInventorySnapshot = {
  skus: CeoInventorySkuRow[];
  lowStockAlerts: string[];
  reorderReviewSignals: string[];
  awaitingTestingLots: number;
  inboundUnitsTotal: number;
  sellableUnitsTotal: number;
  testingEconomicsNote: string;
};

export type CeoSupportSnapshot = {
  genuineCustomerMessages: number;
  green: number;
  yellow: number;
  red: number;
  /** Current-state backlog of legitimate open escalations (not period-limited). */
  unresolvedEscalations: number;
  unresolvedEscalationsLabel: string;
  spamSolicitations: number;
  vendorSolicitations: number;
  topGenuineCategories: Array<{ category: string; count: number }>;
  recurringQuestionHints: string[];
  systemFailures: string[];
  automationIssues: string[];
};

export type CeoSeoSnapshot = {
  status: "available" | "pending";
  message: string;
  clicks: number | null;
  impressions: number | null;
  nonBrandImpressions: number | null;
  nonBrandClicks: number | null;
  ctr: number | null;
  averagePosition: number | null;
  priorClicks: number | null;
  priorImpressions: number | null;
  clicksChangeNote: string | null;
  impressionsChangeNote: string | null;
  pagesGaining: string[];
  queryChanges: string[];
  /** True only when volume + gains clear a materiality bar. */
  materialOpportunity: boolean;
};

export type CeoHealthSnapshot = {
  warnings: string[];
};

export type CeoFulfillmentSnapshot = {
  readyOrders: number;
  holds: number;
  packedWaitingTracking: number;
  /** Only populated when noteworthy (blocked orders or large queue). */
  notes: string[];
};

export type CeoCustomerIntelligenceSnapshot = {
  status: "available" | "unavailable";
  message: string;
  highlights: string[];
  lukeAction: { action: string; why: string } | null;
};

export type CeoWeeklyBrief = {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  generatedAt: string;
  executiveSummary: string[];
  sales: CeoSalesSnapshot;
  acquisition: CeoAcquisitionSnapshot;
  inventory: CeoInventorySnapshot;
  support: CeoSupportSnapshot;
  seo: CeoSeoSnapshot;
  health: CeoHealthSnapshot;
  fulfillment?: CeoFulfillmentSnapshot;
  customerIntelligence?: CeoCustomerIntelligenceSnapshot;
  actions: CeoLukeAction[];
};

export type CeoBriefRow = {
  id: number;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  briefJson: CeoWeeklyBrief;
  executiveSummary: string;
  actionsJson: CeoLukeAction[];
  emailSentAt: string | null;
  emailSendClaimedAt: string | null;
  emailSendLastError: string | null;
  createdAt: string;
};
