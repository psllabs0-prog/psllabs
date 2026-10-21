import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as retiredGet, POST as retiredPost } from "../app/api/research-auth/[...all]/route";
import ResearchAccountPage from "../app/research-account/page";
import AccountEntryPage from "../app/research-account/[mode]/page";
import { __setSqlClientForTests } from "../lib/db/sql";
import { proxy } from "../proxy";

const origin = "https://www.psllabs.org";
let checks = 0;
let sqlCalls = 0;
__setSqlClientForTests((async () => {
  sqlCalls++;
  throw new Error("Browsing public pages must not need account or rate-limit storage.");
}) as never);

function equal(actual: unknown, expected: unknown, message: string) {
  assert.deepEqual(actual, expected, message);
  checks++;
}

async function main() {
  process.env.PSL_VISUAL_PREVIEW = "0";
  for (const path of ["/", "/products", "/products/psl-rt-10mg", "/coa", "/testing", "/shipping", "/faq", "/partners", "/checkout",
    "/api/inventory/availability", "/api/checkout/shipping-options", "/api/authnet-config"]) {
    for (const cookie of ["", "psl_research.session_token=retired-or-forged"]) {
      for (const rsc of [false, true]) {
        const response = await proxy(new NextRequest(origin + path + "?utm_source=regression", {
          headers: { cookie, ...(rsc ? { rsc: "1", "x-psl-research-request-path": "/admin" } : {}) },
        }));
        equal(response.headers.get("x-middleware-next"), "1", `${path} anonymous HTML/RSC continues`);
        equal(response.headers.get("location"), null, `${path} has no sign-in redirect`);
        equal(response.headers.get("x-middleware-rewrite"), null, `${path} retains URL and attribution query`);
        equal(response.headers.get("cache-control"), null, `${path} no longer requires a private account response`);
      }
    }
  }
  for (const method of ["GET", "HEAD"]) {
    for (const range of [null, "bytes=0-1023"]) {
      const headers = new Headers();
      if (range) headers.set("range", range);
      const response = await proxy(new NextRequest(origin + "/organic/2026-10-16/priority-mail.mp4", { method, headers }));
      equal(response.headers.get("x-middleware-next"), "1", `${method} published MP4 remains public`);
      equal(response.headers.get("location"), null, "MP4 is not redirected to HTML");
      equal(response.headers.get("x-middleware-rewrite"), null, "MP4 asset is not rewritten");
      equal(await response.text(), "", "proxy does not replace MP4 bytes");
    }
    const recovery = await proxy(new NextRequest(origin + "/checkout?paymentAction=requireAction&paymentId=fixture-only", { method }));
    equal(recovery.status, 307, "legacy card recovery remains a new document");
    equal(recovery.headers.get("location"), origin + "/payment-return?paymentAction=requireAction&paymentId=fixture-only", "card recovery preserves the private query");
    equal(recovery.headers.get("referrer-policy"), "no-referrer", "private card recovery suppresses referrers");
  }
  for (const path of ["/payment-return", "/success", "/cancel", "/unsubscribe", "/newsletter/confirm"]) {
    const response = await proxy(new NextRequest(origin + path));
    equal(response.headers.get("x-middleware-next"), "1", "receipt/recovery remains reachable");
    equal(response.headers.get("cache-control"), "private, no-store", "receipt/recovery stays private");
    equal(response.headers.get("referrer-policy"), "no-referrer", "receipt/recovery keeps private referrers");
  }
  for (const page of [ResearchAccountPage, AccountEntryPage]) {
    assert.throws(() => page(), error => error instanceof Error &&
      "digest" in error && error.digest === "NEXT_REDIRECT;replace;/products;307;", "retired account pages redirect safely to the catalog");
    checks++;
  }
  for (const handler of [retiredGet, retiredPost]) {
    const response = handler();
    equal(response.status, 410, "retired auth cannot create or mutate an account");
    equal(response.headers.get("set-cookie"), null, "retired auth issues no session");
    equal(response.headers.get("cache-control"), "private, no-store", "retired auth response is not cached");
  }
  equal(sqlCalls, 0, "public paths and retired account endpoints never query account storage");
  __setSqlClientForTests(null);
  console.log(`Research-account rollback: ${checks} checks passed. Public HTML/RSC and MP4 pass-through, retired auth, and private payment recovery. Offline only; no database, provider, mail or order writes.`);
}

main().catch(error => { __setSqlClientForTests(null); console.error(error); process.exitCode = 1; });
