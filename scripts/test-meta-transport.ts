import assert from "node:assert/strict";
import { sendPreparedMetaEvent, metaRequestBody } from "../lib/meta-ads/transport";
import { PSL_META_DATASET_ID, type PreparedMetaEvent } from "../lib/meta-ads/events";
import { readMetaServerConfig } from "../lib/meta-ads/config";
async function main() {
  const event: PreparedMetaEvent = { event_name: "PageView", event_id: "a".repeat(64), event_time: 1_800_000_000,
    action_source: "website", event_source_url: "https://www.psllabs.org/about" };
  const technical = { client_user_agent: "Offline verification fixture", client_ip_address: "192.0.2.1" };
  let transmissions = 0;
  const send = { config: { datasetId: PSL_META_DATASET_ID, apiVersion: "v26.0" as const, accessToken: "OFFLINE_NOT_A_SECRET" },
    event, technical, testCode: "TEST_OFFLINE_ONLY", currentPermission: async () => true,
    fetchImpl: (async (url, options) => {
      transmissions++;
      assert.equal(String(url), `https://graph.facebook.com/v26.0/${PSL_META_DATASET_ID}/events`);
      assert.equal(String(url).includes("OFFLINE_NOT_A_SECRET"), false);
      assert.equal(options?.redirect, "error");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.test_event_code, "TEST_OFFLINE_ONLY");
      assert.deepEqual(Object.keys(body.data[0].user_data).sort(), ["client_ip_address", "client_user_agent"]);
      return Response.json({ events_received: 1 });
    }) as typeof fetch };
  assert.equal(readMetaServerConfig(), null, "production release is gated independently of credentials");
  assert.equal((await sendPreparedMetaEvent({ ...send, currentPermission: async () => false })).ok, false);
  assert.equal(transmissions, 0);
  assert.equal((await sendPreparedMetaEvent(send)).ok, true);
  assert.equal(transmissions, 1);
  const malicious = { ...technical, email: "never-forward@example.invalid", card: "NEVER-FORWARD", health: "NEVER-FORWARD" };
  const body = metaRequestBody(event, malicious, "TEST_OFFLINE_ONLY");
  assert.equal(JSON.stringify(body).includes("NEVER"), false);
  assert.equal(JSON.stringify(body).includes("email"), false);
  assert.equal(metaRequestBody({ ...event, health: "private" } as PreparedMetaEvent, technical), null);
  assert.equal(metaRequestBody(event, { ...technical, fbp: "private-address@example.invalid" }), null);
  assert.equal(metaRequestBody(event, technical, "invalid test code"), null);
  assert.equal((await sendPreparedMetaEvent({ ...send, config: { ...send.config, datasetId: "wrong" } })).ok, false);
  assert.equal(transmissions, 1);
  assert.equal((await sendPreparedMetaEvent({ ...send, fetchImpl: async () => Response.json({ events_received: 0 }) })).ok, false);
  assert.equal((await sendPreparedMetaEvent({ ...send, fetchImpl: async () => { throw new Error("fixture-token-in-provider-error"); } })).reason, "transport_failed");
  console.log("Meta transport offline: disabled production, final permission check, exact data allowlist, isolated test code, credential/redirect protection and sanitized failures passed. No real Meta request sent.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
