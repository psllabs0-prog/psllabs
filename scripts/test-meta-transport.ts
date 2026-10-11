import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { sendPreparedMetaEvent, metaRequestBody } from "../lib/meta-ads/transport";
import { PSL_META_DATASET_ID, type PreparedMetaEvent } from "../lib/meta-ads/events";
import { META_PAGEVIEW_QA_READY, readMetaServerConfig } from "../lib/meta-ads/config";
import * as privacyTypes from "../lib/privacy/types";

function configurationChecks() {
  // Exercise the actual capability adapter without connecting a database or
  // loading credentials. Local process variables are restored after the test.
  const source = readFileSync("lib/privacy/server.ts", "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks: Record<string, unknown> = {
    "../db/sql": { getSql: () => { throw new Error("Offline config tests forbid database access"); } },
    "../admin/auth": { verifyAdminSessionToken: () => false },
    "../google-ads/config": { readGoogleAdsConfig: () => ({ fixture: true }) },
    "../openai-ads/client": { readOpenAIAdsConfig: () => ({ ok: true }) },
    "../meta-ads/config": { readMetaServerConfig },
    "./service": { createPrivacyService: () => ({}) },
    "./types": privacyTypes,
  };
  const exports: Record<string, unknown> = {};
  new Script(`(function(require,exports){${code}\n})`).runInContext(createContext({}))(
    (id: string) => { assert(id in mocks, `Unmocked capability dependency: ${id}`); return mocks[id]; }, exports);
  const capabilities = exports.privacyCapabilities as () => Record<string, boolean>;
  const keys = ["META_ADS_ENABLED", "META_DATASET_ID", "META_CAPI_ACCESS_TOKEN"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const checkCapabilities = (available: boolean) => {
    assert.equal(Boolean(readMetaServerConfig()), available);
    assert.deepEqual(JSON.parse(JSON.stringify(capabilities())), {
      metaMeasurement: available, metaPersonalization: available,
      tiktokMeasurement: false, tiktokPersonalization: false,
      googleMeasurement: true, openaiMeasurement: true,
    }, "Meta capabilities follow valid configuration; other providers stay unchanged");
  };
  try {
    assert.equal(META_PAGEVIEW_QA_READY, true, "the code gate describes isolated scoped QA readiness only");
    for (const key of keys) delete process.env[key];
    checkCapabilities(false);
    process.env.META_DATASET_ID = PSL_META_DATASET_ID;
    process.env.META_CAPI_ACCESS_TOKEN = "OFFLINE_NOT_A_SECRET";
    for (const flag of [undefined, "false", "TRUE", "1"]) {
      if (flag === undefined) delete process.env.META_ADS_ENABLED;
      else process.env.META_ADS_ENABLED = flag;
      checkCapabilities(false);
    }
    process.env.META_ADS_ENABLED = "true";
    checkCapabilities(true);
    assert.deepEqual(readMetaServerConfig(), { datasetId: PSL_META_DATASET_ID,
      accessToken: "OFFLINE_NOT_A_SECRET", apiVersion: "v26.0" });
    process.env.META_DATASET_ID = "wrong";
    checkCapabilities(false);
    process.env.META_DATASET_ID = PSL_META_DATASET_ID;
    for (const token of [undefined, "", "contains space", "contains\ncontrol"]) {
      if (token === undefined) delete process.env.META_CAPI_ACCESS_TOKEN;
      else process.env.META_CAPI_ACCESS_TOKEN = token;
      checkCapabilities(false);
    }
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}
async function main() {
  configurationChecks();
  const event: PreparedMetaEvent = { event_name: "PageView", event_id: "a".repeat(64), event_time: 1_800_000_000,
    action_source: "website", event_source_url: "https://www.psllabs.org/products" };
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
  console.log("Meta transport offline: default-off/valid-config capability gates, final permission check, exact data allowlist, isolated test code, credential/redirect protection and sanitized failures passed. No real Meta request sent.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
