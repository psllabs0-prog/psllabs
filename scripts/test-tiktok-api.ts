import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import { isIP } from "node:net";
import ts from "typescript";
import { NextResponse } from "next/server";
import { isSameOriginMutation } from "../lib/security/request-origin";
import { prepareTikTokEvent, REVIEWED_TIKTOK_EVENT_POLICY } from "../lib/tiktok-ads/events";

function fixture() {
  const state = { active: false, consent: true, personalization: true, current: true,
    gpc: false, admin: false, configReads: 0, receiptReads: 0, sends: 0, rateChecks: 0 };
  const code = ts.transpileModule(readFileSync("app/api/tiktok/events/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse }, "node:net": { isIP },
    "@/lib/security/request-origin": { isSameOriginMutation },
    "@/lib/security/request-rate-limit": { consumeRequestLimit: async () => { state.rateChecks++; return null; } },
    "@/lib/tiktok-ads/config": { readTikTokServerConfig: () => { state.configReads++; return state.active ? {} : null; } },
    "@/lib/privacy/server": {
      readRequestPrivacyConsent: async () => { state.receiptReads++; return { binding: state.consent ? {} : null,
        consent: { measurement: state.consent, personalization: state.personalization, gpc: state.gpc, admin: state.admin,
          capabilities: { tiktokMeasurement: true, tiktokPersonalization: true } } }; },
      privacyService: { current: async (_binding: unknown, provider: string, personal: boolean) => {
        assert.equal(provider, "tiktok"); assert.equal(personal, true); return state.current;
      } }, requestCookie: () => undefined,
    },
    "@/lib/tiktok-ads/events": { prepareTikTokEvent: (event: Parameters<typeof prepareTikTokEvent>[0], options: Parameters<typeof prepareTikTokEvent>[1]) =>
      prepareTikTokEvent(event, { ...options, policy: REVIEWED_TIKTOK_EVENT_POLICY }) },
    "@/lib/tiktok-ads/transport": { sendPreparedTikTokEvent: async (input: { currentPermission: () => Promise<boolean>; event: object; technical: object }) => {
      if (!await input.currentPermission()) return { ok: false }; state.sends++;
      assert.deepEqual(Object.keys(input.technical).sort(), ["ip", "ttclid", "ttp", "user_agent"]);
      return { ok: true };
    } },
  };
  const exports: Record<string, unknown> = {};
  new Script(`(function(require,exports){${code}\n})`).runInContext(createContext({ URL, Date, process: { env: { VERCEL: "1" } } }))(
    (name: string) => { assert(name in mocks, `Unexpected dependency ${name}`); return mocks[name]; }, exports);
  const POST = exports.POST as (request: Request) => Promise<Response>;
  const origin = "https://www.psllabs.org";
  const body = { name: "Pageview", eventId: "a".repeat(64), sourceUrl: `${origin}/products` };
  const post = (value: unknown = body, headers: Record<string, string> = {}) => POST(new Request(`${origin}/api/tiktok/events`, {
    method: "POST", headers: { Origin: origin, Referer: body.sourceUrl, "User-Agent": "Offline fixture",
      "X-Vercel-Forwarded-For": "192.0.2.1", ...headers }, body: JSON.stringify(value),
  }));
  return { state, body, post };
}
async function main() {
  const f = fixture();
  assert.equal((await (await f.post()).json()).event, null);
  assert.equal(f.state.receiptReads, 0); assert.equal(f.state.sends, 0); assert.equal(f.state.rateChecks, 0);
  f.state.active = true;
  assert.equal((await f.post(f.body, { Origin: "https://attacker.invalid" })).status, 403); assert.equal(f.state.receiptReads, 0);
  f.state.consent = false; assert.equal((await (await f.post()).json()).event, null); f.state.consent = true;
  f.state.personalization = false; assert.equal((await (await f.post()).json()).event, null); f.state.personalization = true;
  f.state.gpc = true; assert.equal((await (await f.post()).json()).event, null); f.state.gpc = false;
  f.state.admin = true; assert.equal((await (await f.post()).json()).event, null); f.state.admin = false;
  for (const body of [{ ...f.body, email: "private" }, { ...f.body, name: "Purchase" }, { ...f.body, name: "PageView" },
    { ...f.body, productIds: [123] }, { ...f.body, sourceUrl: "https://www.psllabs.org/admin-ledger.01" },
    { ...f.body, sourceUrl: `${f.body.sourceUrl}?health=private` }]) assert.equal((await (await f.post(body)).json()).event, null);
  assert.equal(f.state.sends, 0);
  assert.equal((await f.post(f.body, { Referer: "https://www.psllabs.org/success?orderId=private" })).status, 400);
  assert.equal((await (await f.post(f.body, { "X-Vercel-Forwarded-For": "", "X-Forwarded-For": "192.0.2.1" })).json()).event, null);
  f.state.current = false; assert.equal((await (await f.post()).json()).event, null); assert.equal(f.state.sends, 0);
  f.state.current = true;
  const response = await f.post(); assert.equal((await response.json()).event.event_id, f.body.eventId);
  assert.equal(f.state.sends, 1); assert.match(response.headers.get("cache-control")!, /no-store/);
  console.log("TikTok API passed offline: inactive zero-effects, same-origin, consent/purpose/GPC/admin gates, exact source, no client Purchase, trusted IP and stable shared ID. No platform calls.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
