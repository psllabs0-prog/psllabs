/** Real legacy route with in-memory dependencies: no database, carrier or mail. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";

type Route = typeof import("../app/api/admin/btcpostage/route");
let checks = 0;
const eq = (actual: unknown, expected: unknown, note: string) => {
  assert.deepEqual(structuredClone(actual), structuredClone(expected), note); checks++;
};
const label = { purchaseStatus: "purchased", trackingNumber: "OFFLINE-TRACKING", testMode: false };

function harness(authorized = true, failingAction?: string) {
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const record = async (action: string, ...args: unknown[]) => {
    calls.push({ action, args });
    if (action === failingAction) throw new Error("PRIVATE_PROVIDER_ERROR fixture@example.invalid 123 Private Street token=do-not-return");
    return action === "label" || action === "record" ? label : { orderId: "psl_OFFLINE_only", label };
  };
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/admin/require-auth": { requireAdminAuth: async () => authorized ? null : Response.json({ error: "Unauthorized" }, { status: 401 }) },
    "@/lib/btcpostage/config": { getBtcpostagePublicConfig: () => ({ configured: true, testMode: false }) },
    "@/lib/btcpostage/schema": { ensureBtcpostageSchema: () => record("schema") },
    "@/lib/btcpostage/service": {
      // Deliberately omit buyOrderLabel and any notification dispatcher.
      getOrderLabelPublic: (...args: unknown[]) => record("label", ...args),
      getOrderRates: (...args: unknown[]) => record("rates", ...args),
      recoverOrderPurchase: (...args: unknown[]) => record("retrieve", ...args),
      verifyOrderAddress: (...args: unknown[]) => record("verify", ...args),
    },
    "@/lib/btcpostage/store": { getBtcpostageLabel: (...args: unknown[]) => record("record", ...args), toPublicLabel: (value: unknown) => value },
  };
  const source = readFileSync(new URL("../app/api/admin/btcpostage/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, unknown> = {};
  const run = new Script(`(function(require,module,exports){${compiled}\n})`).runInContext(createContext({ Error, URL }));
  run((id: string) => { assert(id in mocks, `Unmocked dependency: ${id}`); return mocks[id]; }, { exports }, exports);
  return { route: exports as unknown as Route, calls };
}

const endpoint = "https://www.psllabs.org/api/admin/btcpostage";
function post(action: string, extra: Record<string, unknown> = {}, origin: string | null = "https://www.psllabs.org") {
  return new Request(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify({ action, orderId: "psl_OFFLINE_only", ...extra }) });
}
async function privateReply(response: Response, status: number) {
  eq(response.status, status, "response has expected status");
  eq(response.headers.get("cache-control"), "private, no-store", "admin response cannot be cached publicly");
  return response.json() as Promise<Record<string, unknown>>;
}

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Unexpected external request in offline route check"); };
  try {
    for (const action of ["buy_label", "verify_address", "get_rates", "retrieve_purchase", "status"]) {
      const h = harness(false);
      await privateReply(await h.route.POST(post(action)), 401);
      eq(h.calls, [], "unauthorized actions cannot reach database, carrier or mail");
    }
    const denied = harness(false);
    await privateReply(await denied.route.GET(new Request(`${endpoint}?orderId=psl_OFFLINE_only`)), 401);
    eq(denied.calls, [], "unauthorized reads have no provider or database effects");

    for (const origin of [null, "https://untrusted.invalid"]) {
      const h = harness();
      await privateReply(await h.route.POST(post("retrieve_purchase", {}, origin)), 403);
      eq(h.calls, [], "missing or foreign origin cannot run a legacy action");
    }
    for (const extra of [{}, { confirmPurchase: true, carrier: "USPS", service: "GroundAdvantage" },
      { confirmPurchase: true, carrier: "USPS", service: "Priority", previewToken: "a".repeat(64), testMode: false }]) {
      const h = harness();
      const body = await privateReply(await h.route.POST(post("buy_label", extra)), 409);
      eq(body.code, "USE_COMBINED_FULFILLMENT_FLOW", "legacy purchase instructs owner to use the reviewed quote flow");
      eq(h.calls, [], "retired buy path cannot initialize schema, buy postage, attach tracking or notify");
    }
    for (const raw of ["{", "null", "[]", "12"]) {
      const h = harness();
      await privateReply(await h.route.POST(new Request(endpoint, { method: "POST", headers: { origin: "https://www.psllabs.org" }, body: raw })), 400);
      eq(h.calls, [], "malformed bodies stop before integrations");
    }
    for (const extra of [{ orderId: "" }, { orderId: "x".repeat(151) }]) {
      const h = harness();
      await privateReply(await h.route.POST(post("status", extra)), 400);
      eq(h.calls, [], "invalid order IDs stop before integrations");
    }
    const unknown = harness();
    await privateReply(await unknown.route.POST(post("unrecognized")), 400);
    eq(unknown.calls, [], "unknown action has no integration effects");

    for (const [action, expected] of [["verify_address", "verify"], ["get_rates", "rates"], ["retrieve_purchase", "retrieve"], ["status", "record"]]) {
      const h = harness();
      await privateReply(await h.route.POST(post(action, { btcpOrderId: "offline-existing-purchase", weightOz: "8", depthIn: 6, widthIn: 4, heightIn: 3 })), 200);
      eq(h.calls.map(call => call.action), ["schema", expected], "recovery-only action cannot call a purchase or notification dependency");
      if (action === "retrieve_purchase") eq(h.calls[1].args, [{ orderId: "psl_OFFLINE_only", btcpOrderId: "offline-existing-purchase" }], "retrieval preserves existing order/purchase identity");
      if (action === "get_rates") {
        const pkg = h.calls[1].args[1] as Record<string, unknown>;
        eq([pkg.weightOz, pkg.depthIn, pkg.widthIn, pkg.heightIn], [8, 6, 4, 3], "existing quote package parsing is retained");
      }
    }
    for (const suffix of ["", "?orderId=psl_OFFLINE_only"]) {
      const h = harness();
      await privateReply(await h.route.GET(new Request(endpoint + suffix)), 200);
      eq(h.calls.map(call => call.action), suffix ? ["schema", "label"] : ["schema"], "status GET never buys, changes tracking or sends mail");
    }
    const failure = harness(true, "retrieve");
    const error = await privateReply(await failure.route.POST(post("retrieve_purchase")), 409);
    eq(error.checkStatusFirst, true, "retrieval failure directs status review instead of replacement purchase");
    eq(JSON.stringify(error).includes("PRIVATE_PROVIDER_ERROR"), false, "raw provider errors cannot disclose private details");
    eq(failure.calls.map(call => call.action), ["schema", "retrieve"], "failed recovery never buys or sends mail");
    console.log(`PASS: BTCPostage recovery-only admin route (${checks} offline checks; no database, purchases, tracking writes or mail).`);
  } finally { globalThis.fetch = originalFetch; }
}
void main();
