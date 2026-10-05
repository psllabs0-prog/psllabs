export type GoogleAdsConfig = { tagId: string; conversionLabel: string; sendTo: string };

/** Public IDs only. An explicit flag and both real IDs are required to activate. */
export function readGoogleAdsConfig(
  environment: Record<string, string | undefined> = {
    NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ENABLED,
    NEXT_PUBLIC_GOOGLE_ADS_TAG_ID: process.env.NEXT_PUBLIC_GOOGLE_ADS_TAG_ID,
    NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL: process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL,
  },
): GoogleAdsConfig | null {
  const tagId = environment.NEXT_PUBLIC_GOOGLE_ADS_TAG_ID;
  const conversionLabel = environment.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL;
  if (environment.NEXT_PUBLIC_GOOGLE_ADS_MEASUREMENT_ENABLED !== "true" ||
      !tagId || !/^AW-[1-9][0-9]{5,19}$/.test(tagId) ||
      !conversionLabel || !/^[A-Za-z0-9_-]{5,100}$/.test(conversionLabel)) return null;
  return { tagId, conversionLabel, sendTo: `${tagId}/${conversionLabel}` };
}
