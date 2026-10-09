import assert from "node:assert/strict";
import { createPrivacyService, type ConsentRecord, type ConsentStore } from "../lib/privacy/service";
import { NO_PRIVACY_CAPABILITIES, PRIVACY_CONSENT_TTL_MS, PRIVACY_CONSENT_VERSION } from "../lib/privacy/types";

async function main() {
  const records = new Map<string, ConsentRecord>();
  let reads = 0; let writes = 0; let fail = false; let clock = 1_800_000_000_000;
  const store: ConsentStore = {
    async read(digest) { reads++; if (fail) throw new Error("offline"); return records.get(digest) ?? null; },
    async save(digest, choices, expiresAt, expectedRevision) {
      writes++; if (fail) throw new Error("offline");
      if (expectedRevision !== undefined && (records.get(digest)?.revision ?? 0) !== expectedRevision) return null;
      const value = { digest, ...choices, expiresAt, version: PRIVACY_CONSENT_VERSION,
        revision: (records.get(digest)?.revision ?? 0) + 1 };
      records.set(digest, value); return value;
    },
    async revoke(digest) {
      if (fail) throw new Error("offline");
      const value = records.get(digest);
      if (value && (value.measurement || value.personalization)) {
        records.set(digest, { ...value, measurement: false, personalization: false, revision: value.revision + 1 });
      }
    },
  };
  const caps = { ...NO_PRIVACY_CAPABILITIES, googleMeasurement: true, openaiMeasurement: true };
  const service = createPrivacyService({ store, capabilities: () => caps, now: () => clock });
  const ordinary = { gpc: false, admin: false };
  const initial = await service.read(undefined, ordinary);
  assert.equal(initial.consent.measurement, false);
  assert.equal(initial.binding, null);
  assert.equal(reads, 0); assert.equal(writes, 0);
  assert.equal((await service.read("forged", ordinary)).consent.measurement, false);
  assert.equal(reads, 0);
  const accepted = await service.save(undefined, { measurement: true, personalization: true }, ordinary);
  assert.match(accepted.token, /^[a-f0-9]{64}$/);
  assert.notEqual(accepted.token, accepted.binding?.digest);
  assert.equal(accepted.consent.expiresAt, clock + PRIVACY_CONSENT_TTL_MS);
  assert.equal(await service.current(accepted.binding, "google"), true);
  assert.equal(await service.current(accepted.binding, "openai"), true);
  assert.equal(await service.current(accepted.binding, "meta"), false);
  assert.equal(await service.current({ ...accepted.binding!, version: 0 }, "google"), false);
  assert.equal(await service.current({ ...accepted.binding!, revision: 99 }, "google"), false);
  const declined = await service.save(accepted.token, { measurement: false, personalization: false }, ordinary);
  assert.equal(declined.binding, null);
  assert.equal(await service.current(accepted.binding, "google"), false);
  await assert.rejects(service.save(accepted.token, { measurement: true, personalization: true }, ordinary, accepted.consent.revision),
    /Preferences changed/, "an in-flight grant cannot overwrite a newer decline");
  const reaccepted = await service.save(accepted.token, { measurement: true, personalization: false }, ordinary, declined.consent.revision);
  assert.equal(await service.current(reaccepted.binding, "google"), true);
  assert.equal(await service.current(accepted.binding, "google"), false, "regrant never resurrects old order or queued events");
  assert.equal((await service.read(accepted.token, { ...ordinary, gpc: true })).consent.measurement, false);
  assert.equal(await service.current(reaccepted.binding, "google"), false, "GPC revokes queued server permission");
  const adminGrant = await service.save(accepted.token, { measurement: true, personalization: true }, { ...ordinary, admin: true });
  assert.equal(adminGrant.consent.measurement, false); assert.equal(adminGrant.binding, null);
  const last = await service.save(accepted.token, { measurement: true, personalization: false }, ordinary, adminGrant.consent.revision);
  assert.equal((await service.read(accepted.token, { ...ordinary, admin: true })).consent.measurement, false);
  assert.equal(await service.current(last.binding, "google"), false, "admin access invalidates optional dispatch permission");
  const current = await service.read(accepted.token, ordinary);
  const expires = await service.save(accepted.token, { measurement: true, personalization: false }, ordinary, current.consent.revision);
  clock += PRIVACY_CONSENT_TTL_MS;
  assert.equal(await service.current(expires.binding, "openai"), false);
  assert.equal((await service.read(accepted.token, ordinary)).consent.choice, "unknown");
  const expiredChoice = await service.read(accepted.token, ordinary);
  const renewed = await service.save(accepted.token, { measurement: true, personalization: false }, ordinary, expiredChoice.consent.revision);
  assert.equal(await service.current(renewed.binding, "google"), true, "explicit expiry renewal uses the current revision");
  fail = true;
  assert.equal((await service.read(accepted.token, ordinary)).consent.measurement, false);
  assert.equal(await service.current(expires.binding, "google"), false);
  await assert.rejects(service.save(accepted.token, { measurement: true, personalization: true }, ordinary));
  console.log("Privacy server: opaque receipts, default denial, revision binding, withdrawal, GPC, admin, expiry and storage-failure checks passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
