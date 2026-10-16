import assert from "node:assert/strict";
import type { BtcpostageAddress } from "../lib/btcpostage/types";

export const QA_RECIPIENT = "lukeghaz@gmail.com";
export const QA_SCHEMA = /^psl_fulfillment_qa_\d{8}_[a-f0-9]{16}$/;
export const QA_BUILD_FLAG = "reviewed-isolated-20261016-v1";
export const PSL_VERCEL_PROJECT = "prj_2okzpd1tXGerE2c5i0zdjExu8tLd";

export function assertQaSql(query: string) {
  assert(!/\bpublic\b|\b(?:SET|RESET)\s+(?:(?:LOCAL|SESSION)\s+)?(?:search_path|ROLE|SESSION\s+AUTHORIZATION)|\b(?:ALTER|DROP|CREATE)\s+(?:DATABASE|ROLE|USER|SCHEMA)\b|\b(?:GRANT|REVOKE)\b|\bset_config\s*\(/i.test(query), "QA SQL cannot change scope, privileges, or public relations.");
}
export function assertQaSchemaIdentity(input: { schema: string; oid: string; expectedOid: string; owned: boolean }) {
  assert(QA_SCHEMA.test(input.schema) && /^\d+$/.test(input.oid) && input.oid === input.expectedOid && input.owned === true,
    "Refusing cleanup: temporary schema identity or ownership changed.");
}
export function assertQaBuildEnvironment(env: Record<string, string | undefined>) {
  assert(env.PSL_FULFILLMENT_QA === QA_BUILD_FLAG && env.VERCEL === "1" && env.VERCEL_ENV === "production" &&
    env.VERCEL_PROJECT_ID === PSL_VERCEL_PROJECT && /^[a-f0-9]{40}$/.test(env.PSL_FULFILLMENT_QA_EXPECTED_COMMIT || "") &&
    env.VERCEL_GIT_COMMIT_SHA === env.PSL_FULFILLMENT_QA_EXPECTED_COMMIT && /^[a-f0-9]{32}$/.test(env.PSL_FULFILLMENT_QA_NONCE || ""),
    "Fulfillment QA requires the reviewed staged-production build, exact source commit and one-time nonce.");
}
export function assertQaMailTarget(email: string, orderId: string, schema: string) {
  assert(QA_SCHEMA.test(schema) && email === QA_RECIPIENT && orderId.startsWith(`${schema}_`), "Only the explicitly allowed fake order and test recipient may receive QA mail.");
}
export function assertQaProviderRequest(url: string | URL | Request, init: RequestInit | undefined, from: BtcpostageAddress, schema: string, destination: BtcpostageAddress = from) {
  const target = new URL(typeof url === "string" || url instanceof URL ? url : url.url);
  assert(target.origin === "https://btcpostage.com" && ["/api/verify-address", "/api/get-rates", "/api/create-purchase"].includes(target.pathname) && init?.method === "POST" && init.redirect === "error" && typeof init.body === "string", "Only reviewed BTCPostage QA endpoints may be contacted, without following redirects.");
  const body = new URLSearchParams(init.body);
  if (target.pathname === "/api/verify-address") {
    assert(body.get("street1") === destination.street1 && body.get("zip") === destination.zip && body.get("city") === destination.city && body.get("state") === destination.state && body.get("country") === "US", "QA verification must use the configured sender as destination.");
  } else {
    assert(body.get("from_street") === from.street1 && body.get("to_street") === destination.street1 && body.get("from_zip") === from.zip && body.get("to_zip") === destination.zip && body.get("to_city") === destination.city && body.get("to_state") === destination.state && body.get("to_country") === "US" && body.get("carrier")?.toUpperCase() === "USPS", "QA carrier request must stay USPS and sender-to-sender.");
    if (target.pathname === "/api/create-purchase") {
      assert(body.get("test_mode") === "true" && body.get("order_notes")?.startsWith(`PSL ${schema}_`), "A real postage debit is forbidden in QA.");
    }
  }
}
