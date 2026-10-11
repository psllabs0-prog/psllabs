import { isIP } from "node:net";
import type { TikTokServerConfig } from "./config";
import { PSL_TIKTOK_PIXEL_ID, TIKTOK_EVENT_NAMES, type PreparedTikTokEvent } from "./events";

export type TikTokTechnicalData = { user_agent: string; ip: string; ttp?: string; ttclid?: string };
/** TikTok Events API 2.0: exact field allowlist, no customer matching/contact fields. */
export function tikTokRequestBody(event: PreparedTikTokEvent, technical: TikTokTechnicalData, pixelId: string, testCode?: string) {
  if (!/^[A-Z0-9]{10,64}$/.test(pixelId) ||
      Object.keys(event).some((k) => !["event", "event_id", "event_time", "page", "properties"].includes(k)) ||
      !TIKTOK_EVENT_NAMES.includes(event.event) || !/^[a-f0-9-]{32,64}$/.test(event.event_id) ||
      !Number.isSafeInteger(event.event_time) || !event.page ||
      Object.keys(event.page).some((k) => k !== "url") || typeof event.page.url !== "string") return null;
  if (event.properties && (Object.keys(event.properties).some((k) => !["content_ids", "content_type", "value", "currency"].includes(k)) ||
      event.properties.content_type !== "product" || !Array.isArray(event.properties.content_ids) ||
      event.properties.content_ids.some((id) => typeof id !== "string") ||
      ((event.properties.value !== undefined || event.properties.currency !== undefined) &&
        (!Number.isFinite(event.properties.value) || event.properties.value! <= 0 || event.properties.currency !== "USD")))) return null;
  if (!technical.user_agent || technical.user_agent.length > 512 || !isIP(technical.ip) ||
      /[\x00-\x1f]/.test(technical.user_agent) ||
      (technical.ttp && !/^[A-Za-z0-9._-]{1,256}$/.test(technical.ttp)) ||
      (technical.ttclid && !/^[A-Za-z0-9_-]{1,512}$/.test(technical.ttclid)) ||
      (testCode !== undefined && !/^TEST[0-9A-Za-z_-]{1,64}$/.test(testCode))) return null;
  return { event_source: "web", event_source_id: pixelId,
    data: [{ ...event, user: { user_agent: technical.user_agent, ip: technical.ip,
      ...(technical.ttp ? { ttp: technical.ttp } : {}), ...(technical.ttclid ? { ttclid: technical.ttclid } : {}) } }],
    ...(testCode ? { test_event_code: testCode } : {}),
  };
}
export async function sendPreparedTikTokEvent(input: {
  config: TikTokServerConfig; event: PreparedTikTokEvent; technical: TikTokTechnicalData;
  testCode?: string; currentPermission: () => Promise<boolean>; fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; reason?: string; accepted?: boolean }> {
  if (typeof window !== "undefined") return { ok: false, reason: "server_only" };
  if (!PSL_TIKTOK_PIXEL_ID || input.config.pixelId !== PSL_TIKTOK_PIXEL_ID) return { ok: false, reason: "invalid_configuration" };
  const body = tikTokRequestBody(input.event, input.technical, input.config.pixelId, input.testCode);
  if (!body) return { ok: false, reason: "invalid_data" };
  try {
    if (!await input.currentPermission()) return { ok: false, reason: "consent_unavailable" };
    const response = await (input.fetchImpl ?? fetch)("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json", "Access-Token": input.config.accessToken }, body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const result = await response.json() as { code?: unknown };
    // API acceptance is not proof of receipt or deduplication in native Events Manager.
    return result.code === 0 ? { ok: true, accepted: true } : { ok: false, reason: "provider_rejected" };
  } catch { return { ok: false, reason: "transport_failed" }; }
}
