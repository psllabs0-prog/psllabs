import type { MetaServerConfig } from "./config";
import { META_EVENT_NAMES, PSL_META_DATASET_ID, type PreparedMetaEvent } from "./events";

export type MetaTechnicalData = { client_user_agent: string; client_ip_address: string; fbp?: string };
/** Exact data allowlist: never forward arbitrary request fields or customer contact data. */
export function metaRequestBody(event: PreparedMetaEvent, technical: MetaTechnicalData, testCode?: string) {
  if (Object.keys(event).some((key) => !["event_name", "event_id", "event_time", "action_source", "event_source_url", "custom_data"].includes(key)) ||
      !META_EVENT_NAMES.includes(event.event_name) || event.action_source !== "website" ||
      !/^[a-f0-9-]{32,64}$/.test(event.event_id) || !Number.isSafeInteger(event.event_time)) return null;
  if (event.custom_data && (Object.keys(event.custom_data).some((key) => !["content_ids", "content_type", "value", "currency"].includes(key)) ||
      event.custom_data.content_type !== "product" || !Array.isArray(event.custom_data.content_ids) ||
      event.custom_data.content_ids.some((id) => typeof id !== "string"))) return null;
  if (!technical.client_user_agent || technical.client_user_agent.length > 512 ||
      !technical.client_ip_address || technical.client_ip_address.length > 64 ||
      /[\x00-\x1f]/.test(technical.client_user_agent + technical.client_ip_address)) return null;
  if (technical.fbp && !/^fb\.\d\.\d{10,16}\.[A-Za-z0-9_-]{1,200}$/.test(technical.fbp)) return null;
  if (testCode !== undefined && !/^TEST[0-9A-Za-z_-]{1,64}$/.test(testCode)) return null;
  return { data: [{ ...event, user_data: {
    client_user_agent: technical.client_user_agent,
    client_ip_address: technical.client_ip_address,
    ...(technical.fbp ? { fbp: technical.fbp } : {}),
  } }], ...(testCode ? { test_event_code: testCode } : {}) };
}
export async function sendPreparedMetaEvent(input: {
  config: MetaServerConfig; event: PreparedMetaEvent; technical: MetaTechnicalData;
  testCode?: string; currentPermission: () => Promise<boolean>; fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; reason?: string; received?: number }> {
  if (typeof window !== "undefined") return { ok: false, reason: "server_only" };
  const body = metaRequestBody(input.event, input.technical, input.testCode);
  if (!body || input.config.datasetId !== PSL_META_DATASET_ID || input.config.apiVersion !== "v26.0") {
    return { ok: false, reason: "invalid_configuration_or_data" };
  }
  try {
    // Perform the current receipt/revision check immediately before each attempt.
    if (!await input.currentPermission()) return { ok: false, reason: "consent_unavailable" };
    const response = await (input.fetchImpl ?? fetch)(
      `https://graph.facebook.com/${input.config.apiVersion}/${input.config.datasetId}/events`, {
        method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.config.accessToken}` },
        body: JSON.stringify(body),
      });
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const result = await response.json() as { events_received?: unknown };
    return result.events_received === 1 ? { ok: true, received: 1 } : { ok: false, reason: "unconfirmed_receipt" };
  } catch { return { ok: false, reason: "transport_failed" }; }
}
