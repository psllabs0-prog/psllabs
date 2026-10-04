import assert from "node:assert/strict";
import {
  buildOpenAIOrderCreatedEvent,
  openAIOrderCreatedEventId,
  prepareOpenAIOrderCreatedEvent,
  readOpenAIAdsConfig,
  sendOpenAIOrderCreatedEvent,
  OPENAI_EVENT_MAX_AGE_MS,
  OPENAI_EVENT_MAX_FUTURE_MS,
  OPENAI_PURCHASE_SOURCE_URL,
  type OpenAIEventInvalidReason,
  type OpenAIOrderCreatedEvent,
  type PaidOrderForAds,
} from "../lib/openai-ads";

const nowMs = Date.parse("2026-10-04T18:00:00.000Z");
const order: PaidOrderForAds = {
  orderId: "psl_sanitized_purchase_fixture",
  status: "paid",
  paidAt: "2026-10-04T17:59:00.000Z",
  currency: "USD",
  total: 69.98,
};
const config = { pixelId: "fixture_pixel_123", capiKey: "fixture_secret_for_offline_tests" };
let checks = 0;
function check(actual: unknown, expected: unknown) {
  checks++;
  assert.deepEqual(actual, expected);
}
function rejected(changes: Partial<PaidOrderForAds>, reason: OpenAIEventInvalidReason) {
  check(buildOpenAIOrderCreatedEvent({ ...order, ...changes }, { nowMs }), { ok: false, reason });
}

async function main() {
  // Any accidental real transport fails. All requests below use an injected fake.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Network is forbidden in this offline test"); };
  try {
    const built = buildOpenAIOrderCreatedEvent(order, { nowMs, oppref: "  opaque/unchanged+fixture==  " });
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("Expected valid purchase fixture");
    const event = built.event;
    check(event.data, { type: "contents", amount: 6998, currency: "USD" });
    check(event.timestamp_ms, Date.parse(order.paidAt!));
    check(event.oppref, "  opaque/unchanged+fixture==  ");
    check(event.opt_out, true);
    check(event.source_url, OPENAI_PURCHASE_SOURCE_URL);
    check(event.id.includes(order.orderId), false);
    check(event.id, openAIOrderCreatedEventId(order.orderId));
    check(buildOpenAIOrderCreatedEvent({ ...order, status: "shipped" }, { nowMs }).ok, true);
    const retryBuilt = buildOpenAIOrderCreatedEvent(order, { nowMs: nowMs + 60000 });
    assert.equal(retryBuilt.ok, true);
    if (retryBuilt.ok) {
      check(retryBuilt.event.id, event.id);
      check(retryBuilt.event.timestamp_ms, event.timestamp_ms);
      check("oppref" in retryBuilt.event, false);
    }
    check(openAIOrderCreatedEventId("other_fixture") === event.id, false);
    check(buildOpenAIOrderCreatedEvent({ ...order, currency: "usd" }, { nowMs }).ok, true);
    check(buildOpenAIOrderCreatedEvent({ ...order, total: 0.1 + 0.2 }, { nowMs }).ok, true);
    check(buildOpenAIOrderCreatedEvent(order, { nowMs, optOut: false }).ok, true);
    for (const status of ["pending", "failed", "cancelled"] as const) rejected({ status }, "unpaid_order");
    for (const orderId of ["", "  "]) rejected({ orderId }, "invalid_order_id");
    for (const currency of ["JPY", "KWD", "EUR", " USD ", ""]) rejected({ currency }, "unsupported_currency");
    for (const total of [0, -1, NaN, Infinity, 0.001, 59.999, Number.MAX_SAFE_INTEGER]) {
      rejected({ total }, "invalid_amount");
    }
    for (const paidAt of [null, "invalid", "2026-10-04", "2026-10-04T17:59:00", "2026-10-04T99:99:00Z"]) {
      rejected({ paidAt }, "invalid_paid_at");
    }
    rejected({ paidAt: new Date(nowMs - OPENAI_EVENT_MAX_AGE_MS - 1).toISOString() }, "event_too_old");
    rejected({ paidAt: new Date(nowMs + OPENAI_EVENT_MAX_FUTURE_MS + 1).toISOString() }, "event_in_future");
    check(buildOpenAIOrderCreatedEvent({ ...order, paidAt: new Date(nowMs - OPENAI_EVENT_MAX_AGE_MS).toISOString() }, { nowMs }).ok, true);
    check(buildOpenAIOrderCreatedEvent({ ...order, paidAt: new Date(nowMs + OPENAI_EVENT_MAX_FUTURE_MS).toISOString() }, { nowMs }).ok, true);
    check(buildOpenAIOrderCreatedEvent(order, { nowMs: NaN }), { ok: false, reason: "invalid_clock" });
    check(buildOpenAIOrderCreatedEvent(order, { nowMs, oppref: "  " }), { ok: false, reason: "invalid_oppref" });

    const withPrivateFields = {
      ...event,
      user: { email: "private-fixture@example.invalid", ip_address: "192.0.2.1" },
      arbitrary: "private_fixture",
      data: { ...event.data, contents: [{ name: "Private product fixture" }], private: "fixture" },
    };
    check(prepareOpenAIOrderCreatedEvent(withPrivateFields, nowMs), { ok: true, event });
    const altered = (fields: Partial<OpenAIOrderCreatedEvent>) => prepareOpenAIOrderCreatedEvent({ ...event, ...fields }, nowMs);
    check(altered({ source_url: "https://evil.example/secret" as typeof OPENAI_PURCHASE_SOURCE_URL }).ok, false);
    check(altered({ id: "raw_order_id" }).ok, false);
    check(altered({ data: { type: "contents", amount: 69.98, currency: "USD" } }).ok, false);
    check(altered({ timestamp_ms: nowMs + OPENAI_EVENT_MAX_FUTURE_MS + 1 }).ok, false);
    check(prepareOpenAIOrderCreatedEvent(event, nowMs + OPENAI_EVENT_MAX_AGE_MS), { ok: false, reason: "event_too_old" });

    check(readOpenAIAdsConfig({}), { ok: false, reason: "not_configured" });
    check(readOpenAIAdsConfig({ OPENAI_ADS_PIXEL_ID: config.pixelId }), { ok: false, reason: "not_configured" });
    check(readOpenAIAdsConfig({ OPENAI_ADS_PIXEL_ID: config.pixelId, OPENAI_ADS_CAPI_KEY: config.capiKey }), { ok: true, config });
    check(readOpenAIAdsConfig({ OPENAI_ADS_PIXEL_ID: "pixel&unexpected=other", OPENAI_ADS_CAPI_KEY: config.capiKey }), { ok: false, reason: "invalid_configuration" });
    check(readOpenAIAdsConfig({ OPENAI_ADS_PIXEL_ID: config.pixelId, OPENAI_ADS_CAPI_KEY: "secret\nheader" }), { ok: false, reason: "invalid_configuration" });

    let calls = 0;
    let request: { url: string; init: RequestInit } | undefined;
    const fakeFetch: typeof fetch = async (input, init) => {
      calls++;
      request = { url: String(input), init: init! };
      return new Response(null, { status: 202 });
    };
    check(await sendOpenAIOrderCreatedEvent(event, { nowMs, config: { pixelId: "", capiKey: "" }, fetchImpl: fakeFetch }), {
      ok: false, status: "skipped", reason: "not_configured", retryable: false,
    });
    check(calls, 0);
    check(await sendOpenAIOrderCreatedEvent(event, { nowMs, config: { ...config, capiKey: "invalid key" }, fetchImpl: fakeFetch }), {
      ok: false, status: "failed", reason: "invalid_configuration", retryable: false,
    });
    check(calls, 0);
    check(await sendOpenAIOrderCreatedEvent({ ...event, timestamp_ms: nowMs - OPENAI_EVENT_MAX_AGE_MS - 1 }, { nowMs, config, fetchImpl: fakeFetch }), {
      ok: false, status: "failed", reason: "event_too_old", retryable: false,
    });
    check(calls, 0);
    check(await sendOpenAIOrderCreatedEvent(withPrivateFields, { nowMs, config, fetchImpl: fakeFetch }), {
      ok: true, status: "accepted", httpStatus: 202, eventId: event.id,
    });
    check(calls, 1);
    assert.ok(request);
    check(request.url, "https://bzr.openai.com/v1/events?pid=fixture_pixel_123");
    check(request.init.method, "POST");
    check(request.init.redirect, "error");
    check(request.init.cache, "no-store");
    check((request.init.headers as Record<string, string>).Authorization, `Bearer ${config.capiKey}`);
    check(JSON.parse(request.init.body as string), {
      validate_only: false, integration_source: "psl_labs_server", events: [event],
    });
    check(await sendOpenAIOrderCreatedEvent(event, { nowMs, config, validateOnly: true, fetchImpl: fakeFetch }), {
      ok: true, status: "validated", httpStatus: 202, eventId: event.id,
    });
    check(JSON.parse(request.init.body as string).validate_only, true);
    for (const status of [400, 401, 403, 404, 408, 429, 500, 503]) {
      check(await sendOpenAIOrderCreatedEvent(event, {
        nowMs, config,
        fetchImpl: async () => new Response("private_secret_provider_body", { status }),
      }), {
        ok: false, status: "failed", reason: "http_error", httpStatus: status,
        retryable: status === 408 || status === 429 || status >= 500,
      });
    }
    check(await sendOpenAIOrderCreatedEvent(event, {
      nowMs, config, fetchImpl: async () => { throw new Error("private_secret_from_transport"); },
    }), { ok: false, status: "failed", reason: "transport_error", retryable: true });
    check(await sendOpenAIOrderCreatedEvent(event, {
      nowMs, config, timeoutMs: 10,
      fetchImpl: async () => new Promise<Response>(() => { /* Simulate a stalled transport. */ }),
    }), { ok: false, status: "failed", reason: "timeout", retryable: true });
    for (const timeoutMs of [0, -1, Infinity, 0.5, 30001]) {
      check(await sendOpenAIOrderCreatedEvent(event, { nowMs, config, timeoutMs, fetchImpl: fakeFetch }), {
        ok: false, status: "failed", reason: "invalid_timeout", retryable: false,
      });
    }
    console.log(`OpenAI Ads offline purchase tracking checks passed: ${checks}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(() => {
  console.error("OpenAI Ads offline purchase tracking tests failed");
  process.exitCode = 1;
});
