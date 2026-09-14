/**
 * Source collection health — distinguishes zero activity from unread sources.
 */

export type SourceHealthKey =
  | "finance"
  | "acquisition"
  | "inventory"
  | "fulfillment"
  | "support"
  | "customerIntelligence"
  | "seo"
  | "discord"
  | "ceoBrief";

export type SourceHealthEntry = {
  checked: boolean;
  ok: boolean;
  /** Safe, non-secret error code/summary. */
  errorCode: string | null;
  safeErrorSummary: string | null;
};

export type SourceHealthMap = Record<SourceHealthKey, SourceHealthEntry>;

export function emptySourceHealth(): SourceHealthMap {
  const blank = (): SourceHealthEntry => ({
    checked: false,
    ok: false,
    errorCode: null,
    safeErrorSummary: null,
  });
  return {
    finance: blank(),
    acquisition: blank(),
    inventory: blank(),
    fulfillment: blank(),
    support: blank(),
    customerIntelligence: blank(),
    seo: blank(),
    discord: blank(),
    ceoBrief: blank(),
  };
}

export function markSourceOk(
  health: SourceHealthMap,
  key: SourceHealthKey
): void {
  health[key] = {
    checked: true,
    ok: true,
    errorCode: null,
    safeErrorSummary: null,
  };
}

export function markSourceFailed(
  health: SourceHealthMap,
  key: SourceHealthKey,
  error: unknown
): void {
  const msg =
    error instanceof Error
      ? error.message.replace(/Bearer\s+\S+/gi, "[redacted]").slice(0, 180)
      : "collection_failed";
  health[key] = {
    checked: true,
    ok: false,
    errorCode: "COLLECTION_FAILED",
    safeErrorSummary: msg,
  };
}

/** Map evidence source classes → DecisionContext sourceHealth keys. */
export function evidenceClassToSourceKeys(
  sourceClass: string
): SourceHealthKey[] {
  switch (sourceClass) {
    case "finance":
    case "orders":
      return ["finance"];
    case "meta":
    case "tiktok":
      return ["acquisition"];
    case "inventory":
      return ["inventory"];
    case "fulfillment":
      return ["fulfillment"];
    case "support":
      return ["support"];
    case "customer_feedback":
    case "customer_intelligence":
      return ["customerIntelligence"];
    case "search_console":
    case "authority":
      return ["seo"];
    case "discord_community":
      return ["discord"];
    case "system_health":
      return []; // system_health is composite; do not block resolve alone
    default:
      return [];
  }
}

export function sourceKeysForEvidenceItems(
  items: Array<{ sourceClass: string }>
): SourceHealthKey[] {
  const keys = new Set<SourceHealthKey>();
  for (const item of items) {
    for (const k of evidenceClassToSourceKeys(item.sourceClass)) {
      keys.add(k);
    }
  }
  return [...keys];
}

/**
 * True when any required source for this signal is unavailable or unchecked
 * with failure, or explicitly ok=false.
 */
export function requiredSourcesUnavailable(
  required: SourceHealthKey[],
  health: SourceHealthMap
): boolean {
  for (const key of required) {
    const h = health[key];
    if (!h) continue;
    if (h.checked && !h.ok) return true;
  }
  return false;
}

export function sourcesAuditJson(health: SourceHealthMap): {
  succeeded: string[];
  failed: string[];
  notReached: string[];
} {
  const succeeded: string[] = [];
  const failed: string[] = [];
  const notReached: string[] = [];
  for (const [k, v] of Object.entries(health) as Array<
    [SourceHealthKey, SourceHealthEntry]
  >) {
    if (!v.checked) notReached.push(k);
    else if (v.ok) succeeded.push(k);
    else failed.push(k);
  }
  return { succeeded, failed, notReached };
}
