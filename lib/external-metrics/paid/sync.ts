import { syncMetaAdsDaily } from "./meta-sync";
import { syncTikTokAdsDaily } from "./tiktok-sync";

export type PaidSyncProviderResult = {
  provider: "meta" | "tiktok";
  ok: boolean;
  status: "ok" | "error" | "not_configured";
  recordsWritten: number;
  errorSummary?: string;
};

/**
 * Sync paid platforms independently — one failure does not block the other.
 */
export async function syncPaidAcquisition(options?: {
  asOf?: Date;
  lookbackDays?: number;
}): Promise<{
  ok: boolean;
  providers: PaidSyncProviderResult[];
}> {
  const [meta, tiktok] = await Promise.all([
    syncMetaAdsDaily(options).then((r) => ({
      provider: "meta" as const,
      ...r,
    })),
    syncTikTokAdsDaily(options).then((r) => ({
      provider: "tiktok" as const,
      ...r,
    })),
  ]);

  const providers = [meta, tiktok];
  // Overall ok if no hard errors (not_configured is fine).
  const ok = providers.every((p) => p.status !== "error");
  return { ok, providers };
}
