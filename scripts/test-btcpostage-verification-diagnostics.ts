import assert from "node:assert/strict";
import { verificationErrorDiagnostics } from "../lib/btcpostage/verification-diagnostics";
const address = { name: "Private Recipient", street1: "7246 Confidential Boulevard", street2: "Suite 592", city: "Privateville", state: "AZ", zip: "85016", country: "US", phone: "6025550123" };
const credentials = { key: "SECRET-API-KEY-OFFLINE", secret: "PRIVATE-CREDENTIAL-OFFLINE" };
const result = verificationErrorDiagnostics([
  { code: "E.ADDRESS.NOT_FOUND", message: `Address not found: ${address.street1} ${address.city} ${address.zip}; ${address.name}; ${credentials.key}; ${credentials.secret}; owner@example.invalid https://private.invalid/address`, arbitraryPrivateKey: "DO-NOT-LOG" },
  { error_code: credentials.key, message: "API key invalid; address verification unavailable" },
  "Secondary unit missing. Please contact support.",
  "FOURTH-ERROR-MUST-NOT-APPEAR",
], address, credentials);
assert.equal(result.length, 3);
const serialized = JSON.stringify(result);
for (const privateText of ["7246", "Confidential", "Boulevard", "Privateville", "85016", "Recipient", "owner@", "private.invalid", credentials.key, credentials.secret, "arbitraryPrivateKey", "DO-NOT-LOG", "FOURTH-ERROR"]) {
  assert(!serialized.toLowerCase().includes(privateText.toLowerCase()), `Private value leaked: ${privateText}`);
}
assert(result[0].codes.includes("E.ADDRESS.NOT_FOUND"));
assert(result[0].summary.toLowerCase().includes("address not found"));
assert(result[1].summary.toLowerCase().includes("api key invalid"));
assert(result[2].summary.toLowerCase().includes("secondary unit missing"));
assert.deepEqual(verificationErrorDiagnostics(null, address, credentials), []);
assert(verificationErrorDiagnostics({ code: "lower_case_code", message: "Server error " + "anything ".repeat(1000) }, address, credentials)[0].summary.length <= 240);
console.log("PASS: provider diagnostic shape/code redaction, bounded summaries and private input/credential protection. No network or database.");
