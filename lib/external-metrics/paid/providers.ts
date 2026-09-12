export type PaidProviderId = "meta" | "tiktok";

export type PaidProviderState =
  | "configured"
  | "not_configured"
  | "error"
  | "healthy";

export type PaidProviderStatus = {
  provider: PaidProviderId;
  state: PaidProviderState;
  message: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

export interface PaidAdsProviderAdapter {
  id: PaidProviderId;
  getStatus(): Promise<PaidProviderStatus>;
  /** Optional future sync — returns not_configured until credentials exist. */
  sync?(options?: { asOf?: Date }): Promise<{
    ok: boolean;
    recordsWritten: number;
    errorSummary?: string;
  }>;
}

function envConfigured(...keys: string[]): boolean {
  return keys.every((k) => Boolean(process.env[k]?.trim()));
}

export const metaAdsAdapter: PaidAdsProviderAdapter = {
  id: "meta",
  async getStatus() {
    const configured = envConfigured(
      "META_ADS_ACCESS_TOKEN",
      "META_ADS_ACCOUNT_ID"
    );
    if (!configured) {
      return {
        provider: "meta",
        state: "not_configured",
        message: "Meta Ads credentials not configured.",
        lastSyncAt: null,
        lastError: null,
      };
    }
    try {
      const { getLatestExternalMetricSyncRun } = await import(
        "@/lib/external-metrics/store"
      );
      const last = await getLatestExternalMetricSyncRun("meta_ads");
      if (last?.status === "error") {
        return {
          provider: "meta",
          state: "error",
          message: last.errorSummary ?? "Meta sync error",
          lastSyncAt: last.completedAt ?? last.startedAt,
          lastError: last.errorSummary,
        };
      }
      if (last?.status === "ok") {
        return {
          provider: "meta",
          state: "healthy",
          message: "Meta sync succeeded.",
          lastSyncAt: last.completedAt ?? last.startedAt,
          lastError: null,
        };
      }
    } catch {
      // ignore store probe
    }
    return {
      provider: "meta",
      state: "configured",
      message: "Meta credentials present; live sync not activated in this phase.",
      lastSyncAt: null,
      lastError: null,
    };
  },
};

export const tiktokAdsAdapter: PaidAdsProviderAdapter = {
  id: "tiktok",
  async getStatus() {
    const configured = envConfigured(
      "TIKTOK_ADS_ACCESS_TOKEN",
      "TIKTOK_ADS_ADVERTISER_ID"
    );
    if (!configured) {
      return {
        provider: "tiktok",
        state: "not_configured",
        message: "TikTok Ads credentials not configured.",
        lastSyncAt: null,
        lastError: null,
      };
    }
    try {
      const { getLatestExternalMetricSyncRun } = await import(
        "@/lib/external-metrics/store"
      );
      const last = await getLatestExternalMetricSyncRun("tiktok_ads");
      if (last?.status === "error") {
        return {
          provider: "tiktok",
          state: "error",
          message: last.errorSummary ?? "TikTok sync error",
          lastSyncAt: last.completedAt ?? last.startedAt,
          lastError: last.errorSummary,
        };
      }
      if (last?.status === "ok") {
        return {
          provider: "tiktok",
          state: "healthy",
          message: "TikTok sync succeeded.",
          lastSyncAt: last.completedAt ?? last.startedAt,
          lastError: null,
        };
      }
    } catch {
      // ignore
    }
    return {
      provider: "tiktok",
      state: "configured",
      message:
        "TikTok credentials present; live sync not activated in this phase.",
      lastSyncAt: null,
      lastError: null,
    };
  },
};

export const PAID_ADS_ADAPTERS: PaidAdsProviderAdapter[] = [
  metaAdsAdapter,
  tiktokAdsAdapter,
];

export async function getAllPaidProviderStatuses(): Promise<PaidProviderStatus[]> {
  return Promise.all(PAID_ADS_ADAPTERS.map((a) => a.getStatus()));
}
