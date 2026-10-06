/** Offline origin, throttle, password/session and endpoint-boundary regressions. */
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest } from "next/server";
import { __setSqlClientForTests } from "../lib/db/sql";
import { isSameOriginMutation } from "../lib/security/request-origin";
import { rateLimitClientKey, consumeRequestLimit } from "../lib/security/request-rate-limit";
import { config, proxy } from "../proxy";

// Next installs this global inside its server; a standalone fixture runner must
// supply the Node implementation before importing next/headers-dependent code.
Object.assign(globalThis, { AsyncLocalStorage });

process.env.ADMIN_PASSWORD = "offline_fixture_admin_password_not_a_real_secret";
process.env.VERCEL = "1";
const origin = "https://www.psllabs.org";
let sqlCalls = 0;
let counter = 0;
let unavailable = false;
__setSqlClientForTests((async (strings: TemplateStringsArray) => {
  sqlCalls++;
  if (unavailable) throw new Error("synthetic database outage");
  if (strings.join("?").includes("INSERT INTO request_rate_limits")) return [{ attempts: ++counter, retry_after: 900 }];
  return [];
}) as never);

function request(path: string, requestOrigin: string | null = origin, body: unknown = { password: process.env.ADMIN_PASSWORD }) {
  return new NextRequest(`${origin}${path}`, {
    method: "POST", headers: {
      "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.10",
      ...(requestOrigin === null ? {} : { origin: requestOrigin }),
    }, body: JSON.stringify(body),
  });
}

async function main() {
  // The installed testing helper retains its pre-rename export.
  const { unstable_doesMiddlewareMatch: matchesProxy } = await import("next/experimental/testing/server");
  const { isValidAdminPassword, createAdminSessionToken, verifyAdminSessionToken } = await import("../lib/admin/auth");
  const { POST: login } = await import("../app/api/admin/login/route");
  const { POST: logout } = await import("../app/api/admin/logout/route");
  const hostileOrigins = [null, "null", "https://other.example", "https://sibling.psllabs.org", "https://www.psllabs.org.evil.example", `${origin}/path`, "not a URL"];
  for (const value of hostileOrigins) {
    assert.equal(isSameOriginMutation(request("/api/admin/login", value)), false);
    const before = sqlCalls;
    assert.equal((await login(request("/api/admin/login", value))).status, 403);
    assert.equal((await logout(request("/api/admin/logout", value))).status, 403);
    assert.equal((await proxy(request("/api/admin/inventory/update", value))).status, 403);
    assert.equal(sqlCalls, before, "origin rejection happens before password/counter side effects");
  }
  assert.equal(isSameOriginMutation(request("/api/admin/login")), true);
  const contradictory = request("/api/admin/login");
  contradictory.headers.set("sec-fetch-site", "cross-site");
  assert.equal(isSameOriginMutation(contradictory), false);
  assert.equal(isSameOriginMutation(new Request(`${origin}/api/admin/ledger`)), true);
  for (const path of ["/api/admin/login", "/api/admin/partners", "/api/admin/inventory/update", "/api/admin/future-feature"]) {
    assert.equal(matchesProxy({ config, nextConfig: {}, url: `${origin}${path}` }), true);
  }
  for (const path of ["/api/tagada-webhook", "/api/btcpay-webhook", "/api/checkout/card", "/api/cron/finance-reconcile", "/_next/static/app.js", "/"]) {
    assert.equal(matchesProxy({ config, nextConfig: {}, url: `${origin}${path}` }), false,
      "form throttles must not interrupt provider/recovery or static flows");
  }
  assert.equal(isValidAdminPassword(process.env.ADMIN_PASSWORD!), true);
  for (const value of ["", "wrong", "x".repeat(1025)]) assert.equal(isValidAdminPassword(value), false);
  const session = createAdminSessionToken()!;
  assert.equal(verifyAdminSessionToken(session), true);
  assert.equal(verifyAdminSessionToken(`${session}modified`), false);
  const clientKey = rateLimitClientKey(request("/api/admin/login"))!;
  assert.match(clientKey, /^[a-f0-9]{64}$/);
  assert.equal(clientKey.includes("192.0.2.10"), false);
  const another = request("/api/admin/login");
  another.headers.set("x-vercel-forwarded-for", "192.0.2.11");
  assert.notEqual(rateLimitClientKey(another), clientKey);
  const invalidIp = request("/api/admin/login");
  invalidIp.headers.set("x-vercel-forwarded-for", "not-an-address");
  assert.equal((await consumeRequestLimit(invalidIp, "test", 10, 900))?.status, 503);
  counter = 0;
  assert.equal((await login(request("/api/admin/login", origin, null))).status, 400);
  counter = 0;
  for (let i = 0; i < 10; i++) {
    assert.equal((await login(request("/api/admin/login", origin, { password: "wrong" }))).status, 401);
  }
  const blocked = await login(request("/api/admin/login"));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "900");
  assert.equal(blocked.headers.get("set-cookie"), null, "throttled login cannot issue a session");
  counter = 0;
  const allowed = await login(request("/api/admin/login"));
  assert.equal(allowed.status, 200);
  assert.match(allowed.headers.get("set-cookie")!, /HttpOnly/i);
  assert.match(allowed.headers.get("set-cookie")!, /SameSite=lax/i);
  assert.equal(allowed.headers.get("cache-control"), "no-store");
  unavailable = true;
  assert.equal((await login(request("/api/admin/login"))).status, 503, "counter outage fails closed");
  unavailable = false;
  for (const path of ["/api/checkout", "/api/checkout/card/session", "/api/contact", "/api/newsletter", "/api/track"]) {
    assert.equal(matchesProxy({ config, nextConfig: {}, url: `${origin}${path}` }), true);
    counter = 100;
    assert.equal((await proxy(request(path))).status, 429);
  }
  __setSqlClientForTests(null);
  console.log("PASS: same-origin admin guards, login throttling, fail-closed storage, session validation and form/provider boundaries. Offline fixtures only.");
}

main().catch((error) => { console.error("Request protection regression failed:", error); process.exitCode = 1; });
