/** Actual admin route and SMTP verify helper with an isolated transport; zero messages. */
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { createAdminSessionToken, verifyAdminSessionToken } from "../lib/admin/auth";
import { classifySmtpError } from "../lib/newsletter/send";

const priorPassword = process.env.ADMIN_PASSWORD;
process.env.ADMIN_PASSWORD = "offline_transport_route_admin_fixture_not_real";
let cookie: string | undefined;
let verifyCalls = 0;
let closeCalls = 0;
let sendCalls = 0;
let otherEffects = 0;
let smtpResult = true;
let smtpError: unknown = null;
let constructionError = false;
let checks = 0;
const logs: string[] = [];
const errors: unknown[][] = [];
function check(actual: unknown, expected: unknown) { assert.deepEqual(actual, expected); checks++; }
const unexpected = () => { otherEffects++; throw new Error("Unexpected business operation in verification"); };
const mocks: Record<string, unknown> = {
  "node:crypto": crypto,
  "next/server": { NextResponse },
  "@/lib/admin/auth": { isAdminAuthenticated: async () => verifyAdminSessionToken(cookie ?? "") },
  "@/lib/content/testing-scope": { LEGAL_ENTITY_NAME: "Offline Fixture LLC" },
  "@/lib/newsletter/send": { classifySmtpError },
  "@/lib/seo": { SITE_URL: "https://www.psllabs.org" },
  "@/lib/email/order-documentation": { ORDER_DOCUMENTATION_LINKS: [] },
  "./config": {},
  "@/lib/email/shared": {
    createSmtpTransport: () => {
      if (constructionError) throw new Error("PRIVATE_SMTP_CONSTRUCTION_ERROR password=do-not-log smtp.private.invalid");
      return {
        verify: async () => { verifyCalls++; if (smtpError) throw smtpError; return smtpResult; },
        sendMail: async () => { sendCalls++; throw new Error("Message submission is forbidden in verification tests"); },
        close: () => { closeCalls++; },
      };
    }, EMAIL_COLORS: {}, emailPageWrapper: unexpected, escapeHtml: unexpected,
    SUPPORT_EMAIL: "fixture@example.invalid",
  },
  "@/lib/retention/config": { getRetentionReadiness: unexpected },
  "@/lib/retention/run": { runRetention30dJob: unexpected },
  "@/lib/retention/schema": { ensureRetentionSchema: unexpected },
  "@/lib/retention/store": { addMarketingSuppression: unexpected, countRetentionStats: unexpected,
    getLatestRetentionJobRun: unexpected, listRetentionCandidates: unexpected, setMarketingEligible: unexpected },
};
function load(file: string): Record<string, unknown> {
  const filename = resolve(file);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  const exports: Record<string, unknown> = {};
  const loader = (id: string) => { assert(id in mocks, `Unmocked dependency rejected: ${id}`); return mocks[id]; };
  new Script(`(function(require,exports){${code}\n})`, { filename }).runInContext(createContext({ Date, URL,
    console: { info: (message: string) => logs.push(message), error: (...values: unknown[]) => errors.push(values) },
  }))(loader, exports);
  return exports;
}
mocks["@/lib/admin/require-auth"] = load("lib/admin/require-auth.ts");
mocks["@/lib/retention/email"] = load("lib/retention/email.ts");
const { POST } = load("app/api/admin/retention/route.ts") as { POST: (request: Request) => Promise<Response> };
const checkId = "11111111-2222-4333-a444-555555555555";
function request(body: unknown) {
  return new Request("https://www.psllabs.org/api/admin/retention", {
    method: "POST", headers: { origin: "https://www.psllabs.org", "content-type": "application/json" }, body: JSON.stringify(body),
  });
}
async function main() {
  try {
    for (const token of [undefined, "fabricated", `${createAdminSessionToken()}tampered`]) {
      cookie = token;
      check((await POST(request({ action: "verify_transport", checkId }))).status, 401);
      check([verifyCalls, logs.length, sendCalls, otherEffects], [0, 0, 0, 0]);
    }
    cookie = createAdminSessionToken()!;
    for (const invalid of [null, 123, "", "not-a-uuid", "customer@example.invalid", `${checkId}\nprivate=secret`, "../server"] ) {
      check((await POST(request({ action: "verify_transport", checkId: invalid }))).status, 400);
      check([verifyCalls, logs.length, sendCalls, otherEffects], [0, 0, 0, 0]);
    }
    const succeeded = await POST(request({ action: "verify_transport", checkId: checkId.toUpperCase(),
      email: "PRIVATE_CUSTOMER@example.invalid", password: "PRIVATE_SECRET_NOT_FOR_LOGS" }));
    check(succeeded.status, 200);
    check(await succeeded.json(), { ok: true, result: { verified: true, category: null }, messagesSent: 0, checkId });
    check(succeeded.headers.get("cache-control"), "no-store");
    check(JSON.parse(logs.at(-1)!), { event: "retention_transport_verification", checkId, verified: true, category: null, messagesSent: 0 });
    check([verifyCalls, closeCalls, sendCalls, otherEffects], [1, 1, 0, 0]);
    smtpResult = false;
    const failedBoolean = await POST(request({ action: "verify_transport", checkId }));
    check(failedBoolean.status, 503);
    check(await failedBoolean.json(), { ok: false, result: { verified: false, category: null }, messagesSent: 0, checkId });
    check(JSON.parse(logs.at(-1)!).verified, false);
    smtpError = { code: "EAUTH", response: "535 smtp.private.invalid username=PRIVATE_USER", message: "PRIVATE_PASSWORD failure" };
    const rejected = await POST(request({ action: "verify_transport", checkId }));
    check(rejected.status, 503);
    check((await rejected.json()).result, { verified: false, category: "auth" });
    check(JSON.parse(logs.at(-1)!).category, "auth");
    constructionError = true;
    const unavailable = await POST(request({ action: "verify_transport", checkId }));
    check(unavailable.status, 503);
    check((await unavailable.json()).result, { verified: false, category: "verification_error" });
    check(errors.length, 0);
    constructionError = false; smtpError = null; smtpResult = true;
    const legacy = await POST(request({ action: "verify_transport" }));
    check(legacy.status, 200);
    check(await legacy.json(), { ok: true, result: { verified: true, category: null }, messagesSent: 0 });
    check(JSON.parse(logs.at(-1)!).checkId, null);
    check([sendCalls, otherEffects], [0, 0]);
    check(closeCalls, verifyCalls);
    check(logs.some(value => /PRIVATE_|smtp\.private|customer@|password=|username=/.test(value)), false);
    for (const log of logs) check(Object.keys(JSON.parse(log)).sort(), ["category", "checkId", "event", "messagesSent", "verified"]);
    console.log(`Retention transport route: ${checks} offline authentication, UUID, sanitized-log, actual-boolean/status, exception, closure, and zero-message checks passed. No live connection, send, database, or customer mutation.`);
  } finally {
    if (priorPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = priorPassword;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
