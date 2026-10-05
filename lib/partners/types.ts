export const PARTNER_STATUSES = ["prospect", "awaiting_reply", "reviewing", "active", "paused", "declined"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];
export type PartnerInput = {
  businessName: string;
  contactName: string;
  email: string;
  website: string;
  source: string;
  destination: string;
  notes: string;
};
export type Partner = PartnerInput & {
  id: string;
  code: string;
  status: PartnerStatus;
  createdAt: string;
  updatedAt: string;
  lastContactedAt: string | null;
  lastRepliedAt: string | null;
  followUpDueAt: string | null;
};
export type PartnerMetrics = { paidOrders: number; paidOrderRevenueUsd: number };
export type PartnerDraft = { subject: string; body: string };
export type PartnerDashboardRow = Partner & {
  trackingUrl: string;
  drafts: { qualification: PartnerDraft; followUp: PartnerDraft };
  metrics: PartnerMetrics;
};
export type PartnersDashboard = {
  available: true;
  partners: PartnerDashboardRow[];
  summary: PartnerMetrics & { partners: number; active: number; followUpsDue: number };
  outboundSendingEnabled: false;
};
