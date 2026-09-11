import type {
  MessageStatus,
  SupportCategory,
  SupportRiskLevel,
} from "./constants";

export type InboundEmailNormalized = {
  providerMessageId: string;
  /** IMAP UID when fetched from mailbox; used to mark \Seen after durable handling. */
  imapUid?: number | null;
  threadKey: string;
  fromEmail: string;
  fromName: string | null;
  toEmail: string | null;
  subject: string;
  receivedAt: string;
  normalizedBody: string;
  rawHeadersSummary: string | null;
};

export type ClassificationResult = {
  category: SupportCategory;
  riskLevel: SupportRiskLevel;
  confidence: number;
  reasons: string[];
  autoResponseAllowed: boolean;
  extractedOrderId: string | null;
  extractedTracking: string | null;
};

export type DraftResult = {
  bodyText: string;
  bodyHtml: string;
  knowledgeSources: string[];
  aiDrafted: boolean;
  requiresEscalation: boolean;
  escalationReason: string | null;
  policyDecision: string;
};

export type SupportThreadRow = {
  id: number;
  threadKey: string;
  fromEmail: string;
  subject: string | null;
  autoSendDisabled: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type SupportMessageRow = {
  id: number;
  threadId: number;
  providerMessageId: string;
  fromEmail: string;
  subject: string;
  receivedAt: string;
  normalizedBody: string;
  status: MessageStatus;
  reportingExcluded: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SupportClassificationRow = {
  id: number;
  messageId: number;
  category: SupportCategory;
  riskLevel: SupportRiskLevel;
  confidence: number;
  reasonsJson: string[];
  autoResponseAllowed: boolean;
  createdAt: string;
};

export type SupportResponseRow = {
  id: number;
  messageId: number;
  draftBody: string;
  sentBody: string | null;
  knowledgeSources: string[];
  aiDrafted: boolean;
  humanApproved: boolean;
  policyDecision: string;
  sentAt: string | null;
  createdAt: string;
};

export type SupportEscalationRow = {
  id: number;
  messageId: number;
  riskLevel: SupportRiskLevel;
  reason: string;
  notifiedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type ProcessMessageResult = {
  messageId: number;
  providerMessageId: string;
  status: MessageStatus;
  category: SupportCategory;
  riskLevel: SupportRiskLevel;
  confidence: number;
  autoSent: boolean;
  escalated: boolean;
  skippedDuplicate: boolean;
  /** True when Neon has a durable draft/escalation/sent/failed-with-draft row. */
  durableCaptured: boolean;
  customerSendRetried?: boolean;
  escalationNotified?: boolean;
  error?: string;
};

export type SupportJobSummary = {
  messagesChecked: number;
  newMessages: number;
  autoSent: number;
  escalated: number;
  failed: number;
  skipped: number;
  errors: string[];
};
