import type { ConsentRecord, ConsentStore } from "./service";
import { PRIVACY_CONSENT_VERSION } from "./types";

// Preview choices are ephemeral and isolated. They cannot grant advertising access.
const records = new Map<string, ConsentRecord>();
function prune() {
  const now = Date.now();
  for (const [key, record] of records) if (record.expiresAt <= now) records.delete(key);
  while (records.size >= 1000) records.delete(records.keys().next().value!);
}
export const designPreviewConsentStore: ConsentStore = {
  async read(digest) { prune(); return records.get(digest) ?? null; },
  async save(digest, choices, expiresAt, expectedRevision) {
    prune();
    const previous = records.get(digest);
    if (expectedRevision !== undefined && expectedRevision !== (previous?.revision ?? 0)) return null;
    const record: ConsentRecord = { digest, revision: (previous?.revision ?? 0) + 1,
      version: PRIVACY_CONSENT_VERSION, expiresAt: Math.min(expiresAt, Date.now() + 3600000), ...choices };
    records.set(digest, record);
    return record;
  },
  async revoke(digest) {
    const previous = records.get(digest);
    if (previous) records.set(digest, { ...previous, revision: previous.revision + 1,
      measurement: false, personalization: false });
  },
};
