import { createPublicKey, verify as cryptoVerify } from "node:crypto";

/**
 * Verify Discord interaction signature using Ed25519.
 * MUST run on the RAW body string before JSON.parse.
 */
export function verifyDiscordRequest(input: {
  publicKeyHex: string;
  signatureHex: string;
  timestamp: string;
  rawBody: string;
}): boolean {
  try {
    const keyBytes = Buffer.from(input.publicKeyHex, "hex");
    if (keyBytes.length !== 32) return false;
    const sig = Buffer.from(input.signatureHex, "hex");
    if (sig.length !== 64) return false;

    // SPKI DER prefix for Ed25519 raw public key
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const key = createPublicKey({
      key: Buffer.concat([spkiPrefix, keyBytes]),
      format: "der",
      type: "spki",
    });

    const message = Buffer.from(input.timestamp + input.rawBody, "utf8");
    return cryptoVerify(null, message, key, sig);
  } catch {
    return false;
  }
}
