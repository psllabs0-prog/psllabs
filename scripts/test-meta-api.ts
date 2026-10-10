import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import { isIP } from "node:net";
import ts from "typescript";
import { NextResponse } from "next/server";
import { isSameOriginMutation } from "../lib/security/request-origin";
import { prepareMetaEvent, REVIEWED_META_EVENT_POLICY } from "../lib/meta-ads/events";
import { PRIVACY_CONSENT_VERSION } from "../lib/privacy/types";
const ORIGIN = "https://www.psllabs.org";
function fixture() {
  const state = { active: false, consent: true, personalization: true, current: true,
    configReads: 0, receiptReads: 0, sends: 0, rateChecks: 0, returnOk: true };
  const filename = resolve("app/api/meta/events/route.ts");
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse }, "node:net": { isIP },
    "@/lib/security/request-origin": { isSameOriginMutation },
    "@/lib/security/request-rate-limit": { consumeRequestLimit: async () => { state.rateChecks++; return null; } },
    "@/lib/meta-ads/config": { readMetaServerConfig: () => { state.configReads++; return state.active ? { fixture: true } : null; } },
    "@/lib/privacy/server": {
      readRequestPrivacyConsent: async () => { state.receiptReads++; return {
        binding: state.consent ? { digest: "a".repeat(64), revision: 1, version: PRIVACY_CONSENT_VERSION } : null,
        consent: { measurement: state.consent, personalization: state.personalization,
          capabilities: { metaMeasurement: true, metaPersonalization: true } },
      }; },
      privacyService: { current: async () => state.current }, requestCookie: () => undefined,
    },
    "@/lib/meta-ads/events": { prepareMetaEvent: (event: Parameters<typeof prepareMetaEvent>[0], options: Parameters<typeof prepareMetaEvent>[1]) =>
      prepareMetaEvent(event, { ...options, policy: REVIEWED_META_EVENT_POLICY }) },
    "@/lib/meta-ads/transport": { sendPreparedMetaEvent: async (input: { currentPermission: () => Promise<boolean>; event: object; technical: object }) => {
      if (!await input.currentPermission()) return { ok: false };
      state.sends++;
      assert.equal(JSON.stringify(input.technical).includes("email"), false);
      assert.equal(JSON.stringify(input.event).includes("health"), false);
      return { ok: state.returnOk };
    } },
  };
  const exports: Record<string, unknown> = {};
  const loader = (id: string) => { assert(id in mocks, `Unmocked dependency: ${id}`); return mocks[id]; };
  new Script(`(function(require,exports){${code}\n})`).runInContext(createContext({ URL, Date, process: { env: { VERCEL: "1" } } }))(loader, exports);
  const POST = exports.POST as (request: Request) => Promise<Response>;
  const body = { name: "PageView", eventId: "b".repeat(64), sourceUrl: `${ORIGIN}/about` };
  const post = (value: unknown = body, headers: Record<string, string> = {}) => POST(new Request(`${ORIGIN}/api/meta/events`, {
    method: "POST", headers: { Origin: ORIGIN, Referer: `${ORIGIN}/about`, "User-Agent": "Offline fixture", "X-Vercel-Forwarded-For": "192.0.2.1", ...headers },
    body: JSON.stringify(value),
  }));
  return { state, body, post };
}
async function main() {
  const f = fixture();
  assert.deepEqual(await (await f.post()).json(), { event: null });
  assert.equal(f.state.receiptReads, 0); assert.equal(f.state.sends, 0); assert.equal(f.state.rateChecks, 0);
  f.state.active = true;
  assert.equal((await f.post(f.body, { Origin: "https://attacker.invalid" })).status, 403);
  assert.equal(f.state.receiptReads, 0);
  f.state.consent = false;
  assert.deepEqual(await (await f.post()).json(), { event: null }); assert.equal(f.state.sends, 0);
  f.state.consent = true; f.state.personalization = false;
  assert.deepEqual(await (await f.post()).json(), { event: null }); assert.equal(f.state.sends, 0);
  f.state.personalization = true;
  for (const body of [{ ...f.body, email: "private@example.invalid" }, { ...f.body, name: "Purchase" },
    { ...f.body, productIds: [123] }, { ...f.body, sourceUrl: `${ORIGIN}/about?medical=private` },
    { ...f.body, sourceUrl: `${ORIGIN}/admin-ledger.01` }]) {
    assert.equal((await (await f.post(body)).json()).event, null);
  }
  assert.equal(f.state.sends, 0);
  assert.equal((await f.post(f.body, { Referer: `${ORIGIN}/success?orderId=private` })).status, 400);
  assert.equal((await (await f.post(f.body, { "X-Vercel-Forwarded-For": "", "X-Forwarded-For": "192.0.2.1" })).json()).event, null);
  assert.equal(f.state.sends, 0, "an untrusted forwarding header cannot supply the IP");
  f.state.current = false;
  assert.equal((await (await f.post()).json()).event, null); assert.equal(f.state.sends, 0);
  f.state.current = true;
  const response = await f.post();
  assert.equal((await response.json()).event.event_id, f.body.eventId);
  assert.equal(f.state.sends, 1); assert.match(response.headers.get("cache-control")!, /no-store/);
  console.log("Meta events API: inactive zero-effects, same-origin/consent/purpose gates, exact source, strict field allowlist, trusted IP and shared event-ID checks passed offline.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
