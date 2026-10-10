/** Actual consent route + service with in-memory persistence; no network or production data. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { isSameOriginMutation } from "../lib/security/request-origin";
import * as privacyTypes from "../lib/privacy/types";
import * as privacyModule from "../lib/privacy/service";
import type { ConsentRecord, ConsentStore } from "../lib/privacy/service";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const ORIGIN = "https://fixture.invalid";
let checks = 0;
function check(actual: unknown, expected: unknown, message?: string) {
  assert.deepEqual(actual, expected, message); checks++;
}

function fixture() {
  const records = new Map<string, ConsentRecord>();
  const state = { reads: 0, saves: 0, revokes: 0, rateChecks: 0,
    readFails: false, saveFails: false, revokeFails: false, rateLimited: false, now: NOW };
  const store: ConsentStore = {
    async read(digest) {
      state.reads++;
      if (state.readFails) throw new Error("PRIVATE_FIXTURE_DB_ERROR");
      return structuredClone(records.get(digest) ?? null);
    },
    async save(digest, choices, expiresAt, expectedRevision) {
      state.saves++;
      if (state.saveFails) throw new Error("PRIVATE_FIXTURE_DB_ERROR");
      const existing = records.get(digest);
      if (choices.measurement && (existing?.revision ?? 0) !== expectedRevision) return null;
      const record = { digest, revision: (existing?.revision ?? 0) + 1,
        version: privacyTypes.PRIVACY_CONSENT_VERSION, ...choices, expiresAt };
      records.set(digest, record); return structuredClone(record);
    },
    async revoke(digest) {
      state.revokes++;
      if (state.revokeFails) throw new Error("PRIVATE_FIXTURE_DB_ERROR");
      const existing = records.get(digest);
      if (existing && (existing.measurement || existing.personalization)) {
        records.set(digest, { ...existing, measurement: false, personalization: false, revision: existing.revision + 1 });
      }
    },
  };
  const service = privacyModule.createPrivacyService({ store, now: () => state.now,
    capabilities: () => ({ ...privacyTypes.NO_PRIVACY_CAPABILITIES, googleMeasurement: true, openaiMeasurement: true }) });
  const cookie = (request: Request, name: string) => request.headers.get("cookie")?.split(";")
    .map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
  const context = (request: Request) => ({ gpc: request.headers.get("Sec-GPC") === "1",
    admin: request.headers.get("X-Offline-Admin") === "1" });
  const filename = resolve("app/api/privacy/consent/route.ts");
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText;
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse }, "@/lib/security/request-origin": { isSameOriginMutation },
    "@/lib/security/request-rate-limit": { consumeRequestLimit: async () => {
      state.rateChecks++;
      return state.rateLimited ? NextResponse.json({ error: "rate_limited" }, { status: 429 }) : null;
    } },
    "@/lib/privacy/types": privacyTypes, "@/lib/privacy/service": privacyModule,
    "@/lib/privacy/server": {
      privacyService: service, requestCookie: cookie, requestPrivacyContext: context,
      readRequestPrivacyConsent: (request: Request) => service.read(cookie(request, privacyTypes.PRIVACY_CONSENT_COOKIE), context(request)),
    },
  };
  const exports: Record<string, unknown> = {};
  const loader = (id: string) => { assert(id in mocks, `Unmocked privacy dependency: ${id}`); return mocks[id]; };
  new Script(`(function(require,exports){${code}\n})`).runInContext(createContext({ process: { env: { NODE_ENV: "production" } } }))(loader, exports);
  const routes = exports as { GET: (request: Request) => Promise<Response>; POST: (request: Request) => Promise<Response> };
  let token: string | undefined;
  const headers = (extra: Record<string, string> = {}) => ({ Origin: ORIGIN,
    ...(token ? { Cookie: `${privacyTypes.PRIVACY_CONSENT_COOKIE}=${token}` } : {}), ...extra });
  const get = (extra: Record<string, string> = {}) => routes.GET(new Request(`${ORIGIN}/api/privacy/consent`, { headers: headers(extra) }));
  const post = (body: unknown, extra: Record<string, string> = {}) => routes.POST(new Request(`${ORIGIN}/api/privacy/consent`, {
    method: "POST", headers: headers(extra), body: JSON.stringify(body),
  }));
  const grant = (expectedRevision = 0) => ({ version: privacyTypes.PRIVACY_CONSENT_VERSION,
    measurement: true, personalization: true, verifiedAdult: true, expectedRevision });
  const decline = (expectedRevision = 0) => ({ ...grant(expectedRevision), measurement: false, personalization: false });
  async function initialize() {
    const response = await get();
    const setCookie = response.headers.get("set-cookie")!;
    token = setCookie.match(/psl_optional_consent=([a-f0-9]{64})/)?.[1]; assert(token);
    return response;
  }
  return { state, records, service, routes, get, post, grant, decline, initialize,
    digest: () => privacyModule.consentDigest(token)!, token: () => token };
}

async function main() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Offline privacy tests forbid network requests"); };
  try {
    {
      const f = fixture();
      check((await f.post(f.grant())).status, 409, "POST cannot create or replace a receipt identity");
      const response = await f.initialize();
      const body = await response.json();
      check(body.consent.measurement, false); check(body.consent.choice, "unknown");
      check([f.state.saves, f.state.reads], [0, 0]);
      assert.match(response.headers.get("set-cookie")!, /HttpOnly/i);
      assert.match(response.headers.get("set-cookie")!, /Secure/i);
      assert.match(response.headers.get("set-cookie")!, /SameSite=lax/i);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      check(response.headers.get("vary"), "Cookie, Sec-GPC"); checks += 4;
      check(JSON.stringify(body).includes(f.token()!), false);
      const granted = await f.post(f.grant());
      check(granted.status, 200); check(granted.headers.get("set-cookie"), null);
      const value = await granted.json(); check(value.consent.measurement, true);
      check(value.consent.capabilities.metaMeasurement, false);
      check("binding" in value, false); check(JSON.stringify(value).includes(f.digest()), false);
      const binding = { digest: f.digest(), revision: 1, version: privacyTypes.PRIVACY_CONSENT_VERSION };
      check(await f.service.current(binding, "google"), true);
      check(await f.service.current(binding, "meta"), false);
      check((await (await f.get()).json()).consent.measurement, true);
      check((await f.get()).headers.get("set-cookie"), null, "GET keeps existing identity stable");
      check((await f.post(f.decline(1))).status, 200);
      check(await f.service.current(binding, "google"), false);
      check((await f.post(f.grant(1))).status, 409, "a late grant cannot overwrite the newer decline");
      check((await (await f.get()).json()).consent.measurement, false);
      check((await f.post(f.grant(2))).status, 200, "explicit current choice can regrant");
      check(await f.service.current(binding, "google"), false, "regrant never revives an old order binding");
    }
    {
      const f = fixture(); await f.initialize();
      for (const origin of ["", "null", "https://sibling.fixture.invalid", "https://outside.invalid", `${ORIGIN}/bad`]) {
        check((await f.post(f.grant(), { Origin: origin })).status, 403);
      }
      check((await f.post(f.grant(), { "Sec-Fetch-Site": "cross-site" })).status, 403);
      check(f.state.saves, 0); check(f.state.rateChecks, 0);
      for (const body of [null, [], "bad", {}, { ...f.grant(), verifiedAdult: false },
        { ...f.grant(), version: 99 }, { ...f.grant(), version: privacyTypes.PRIVACY_CONSENT_VERSION - 1 },
        { ...f.grant(), measurement: "true" },
        { ...f.grant(), expectedRevision: -1 }, { ...f.grant(), expectedRevision: 1.2 },
        { ...f.grant(), expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
        { ...f.grant(), measurement: false }, { ...f.grant(), binding: { digest: f.digest() } },
        { ...f.grant(), privacyConsent: { digest: f.digest() } }, { ...f.grant(), token: f.token() }]) {
        check((await f.post(body)).status, 400);
      }
      check((await f.post(f.grant(), { "Content-Length": "1025" })).status, 400);
      check((await f.post("x".repeat(1025))).status, 400);
      check(f.state.saves, 0); check(f.state.rateChecks, 0);
    }
    for (const signal of [{ "Sec-GPC": "1" }, { "X-Offline-Admin": "1" }] as Array<Record<string, string>>) {
      const f = fixture(); await f.initialize(); await f.post(f.grant());
      const read = await f.get(signal);
      check((await read.json()).consent.measurement, false);
      check(f.records.get(f.digest())!.measurement, false); check(f.state.revokes, 1);
      f.state.rateLimited = true;
      check((await f.post(f.grant(2), signal)).status, 200,
        "GPC/admin forces denial even when the body requests a rate-limited grant");
      check(f.records.get(f.digest())!.measurement, false);
    }
    {
      const f = fixture(); await f.initialize(); await f.post(f.grant()); f.state.rateLimited = true;
      check((await f.post(f.grant(1))).status, 429);
      const checksBeforeDecline = f.state.rateChecks;
      check((await f.post(f.decline(1))).status, 200);
      check(f.state.rateChecks, checksBeforeDecline, "withdrawal bypasses the grant limit");
      check(f.records.get(f.digest())!.measurement, false);
    }
    {
      const f = fixture(); await f.initialize(); await f.post(f.grant());
      f.state.now += privacyTypes.PRIVACY_CONSENT_TTL_MS + 1;
      const expired = (await (await f.get()).json()).consent;
      check(expired.choice, "unknown"); check(expired.measurement, false); check(expired.revision, 1);
      check((await f.post(f.grant(expired.revision))).status, 200, "expiry can renew through current revision");
      f.records.get(f.digest())!.version = privacyTypes.PRIVACY_CONSENT_VERSION - 1;
      const outdated = (await (await f.get()).json()).consent;
      check(outdated.choice, "unknown"); check(outdated.measurement, false); check(outdated.revision, 2);
      check((await f.post(f.grant(outdated.revision))).status, 200, "new policy version can collect a new choice");
    }
    {
      const f = fixture(); await f.initialize(); await f.post(f.grant()); f.state.readFails = true;
      const response = await f.get();
      check((await response.json()).consent.measurement, false);
      check(await f.service.current({ digest: f.digest(), version: privacyTypes.PRIVACY_CONSENT_VERSION, revision: 1 }, "google"), false);
      f.state.readFails = false; f.state.revokeFails = true;
      check((await (await f.get({ "Sec-GPC": "1" })).json()).consent.measurement, false);
      f.state.saveFails = true;
      const failed = await f.post(f.decline(1));
      check(failed.status, 503); check(failed.headers.get("set-cookie"), null);
      check((await failed.text()).includes("PRIVATE_FIXTURE"), false);
    }
    console.log(`Privacy API offline checks passed: ${checks} (actual route/service, no external effects)`);
  } finally { globalThis.fetch = previousFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
