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

  // Enabling a new provider never repurposes a previous policy's receipt or an
  // order bound to it, even when the earlier record contained both choices.
  const previousVersion = PRIVACY_CONSENT_VERSION - 1;
  const previousRecord = { ...records.get(renewed.binding!.digest)!, version: previousVersion, personalization: true };
  records.set(previousRecord.digest, previousRecord);
  caps.metaMeasurement = true; caps.metaPersonalization = true;
  const previousBinding = { ...renewed.binding!, version: previousVersion };
  const needsChoice = await service.read(accepted.token, ordinary);
  assert.equal(needsChoice.consent.choice, "unknown");
  assert.equal(needsChoice.consent.measurement, false);
  assert.equal(needsChoice.consent.personalization, false);
  assert.equal(needsChoice.binding, null);
  assert.equal(needsChoice.consent.revision, previousRecord.revision, "reconsent retains the revision needed for atomic saving");
  for (const provider of ["google", "openai", "meta"] as const) {
    assert.equal(await service.current(previousBinding, provider), false, "old policy bindings remain invalid");
  }
  const newChoice = await service.save(accepted.token, { measurement: true, personalization: true }, ordinary, needsChoice.consent.revision);
  assert.equal(newChoice.binding!.version, PRIVACY_CONSENT_VERSION);
  assert.equal(await service.current(newChoice.binding, "meta", true), true, "Meta requires a new current-version choice");
  assert.equal(await service.current(previousBinding, "meta", true), false, "new consent does not backfill earlier orders");
  const onlyMeasurement = await service.save(accepted.token, { measurement: true, personalization: false }, ordinary, newChoice.consent.revision);
  assert.equal(await service.current(onlyMeasurement.binding, "google"), true);
  assert.equal(await service.current(onlyMeasurement.binding, "openai"), true);
  assert.equal(await service.current(onlyMeasurement.binding, "meta", true), false, "measurement-only choice does not satisfy Meta's dual-purpose gate");
  assert.equal(await service.current(newChoice.binding, "tiktok", true), false, "Meta availability never authorizes TikTok");
  caps.tiktokMeasurement = true;
  const tiktokChoice = await service.save(accepted.token, { measurement: true, personalization: true }, ordinary, onlyMeasurement.consent.revision);
  assert.equal(await service.current(tiktokChoice.binding, "tiktok", true), false, "TikTok personalization requires its own verified capability");
  caps.tiktokPersonalization = true;
  assert.equal(await service.current(tiktokChoice.binding, "tiktok", true), true);
  await service.save(accepted.token, { measurement: false, personalization: false }, ordinary, tiktokChoice.consent.revision);
  assert.equal(await service.current(tiktokChoice.binding, "tiktok", true), false, "withdrawal invalidates TikTok server dispatch");
  fail = true;
  assert.equal((await service.read(accepted.token, ordinary)).consent.measurement, false);
  assert.equal(await service.current(expires.binding, "google"), false);
  await assert.rejects(service.save(accepted.token, { measurement: true, personalization: true }, ordinary));
  console.log("Privacy server: opaque receipts, default denial, revision binding, withdrawal, GPC, admin, expiry and storage-failure checks passed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
