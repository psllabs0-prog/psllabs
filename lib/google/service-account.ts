import crypto from "crypto";

export type GoogleServiceAccountCreds = {
  clientEmail: string;
  privateKey: string;
};

export function normalizeGooglePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n").trim();
}

/**
 * Shared SA credential loader (same env vars as Sheets).
 * Prefer GOOGLE_SERVICE_ACCOUNT_JSON; fall back to split email/key.
 */
export function getGoogleServiceAccountCreds(): GoogleServiceAccountCreds | null {
  const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as {
        client_email?: string;
        private_key?: string;
      };
      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email,
          privateKey: normalizeGooglePrivateKey(parsed.private_key),
        };
      }
    } catch {
      console.error("[google] GOOGLE_SERVICE_ACCOUNT_JSON is invalid JSON");
      return null;
    }
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKey) return null;

  return {
    clientEmail,
    privateKey: normalizeGooglePrivateKey(privateKey),
  };
}

function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** OAuth access token for an explicit scope (never log the JWT or private key). */
export async function getGoogleAccessToken(
  creds: GoogleServiceAccountCreds,
  scope: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: creds.clientEmail,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(creds.privateKey));
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Google OAuth token failed (${res.status}): ${text.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Google OAuth token response missing access_token");
  }
  return data.access_token;
}
