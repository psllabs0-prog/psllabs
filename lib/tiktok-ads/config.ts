import { PSL_TIKTOK_PIXEL_ID } from "./events";

// Only a reviewed release after native receipt, deduplication, consent and data-use
// verification can enable collection. An environment variable is insufficient.
export const TIKTOK_PRODUCTION_VERIFIED = false;
export const TIKTOK_BROWSER_VERIFIED = false;
export type TikTokServerConfig = { pixelId: string; accessToken: string };
export function readTikTokServerConfig(): TikTokServerConfig | null {
  if (!TIKTOK_PRODUCTION_VERIFIED || !PSL_TIKTOK_PIXEL_ID || process.env.TIKTOK_ADS_ENABLED !== "true" ||
      process.env.TIKTOK_PIXEL_ID !== PSL_TIKTOK_PIXEL_ID) return null;
  const accessToken = process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN;
  if (!accessToken || !/^[\x21-\x7e]{1,4096}$/.test(accessToken)) return null;
  return { pixelId: PSL_TIKTOK_PIXEL_ID, accessToken };
}
