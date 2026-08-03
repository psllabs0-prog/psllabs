import { getSql } from "@/lib/db/sql";

let schemaReady: Promise<void> | null = null;

export async function ensureNewsletterSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  const sql = getSql();
  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id            BIGSERIAL PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        signed_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        confirmed     BOOLEAN NOT NULL DEFAULT false
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS newsletter_subscribers_email_idx
      ON newsletter_subscribers (email)
    `;
  })();
  return schemaReady;
}

export type NewsletterSubscribeResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; error: string };

export async function subscribeNewsletterEmail(
  rawEmail: string
): Promise<NewsletterSubscribeResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@") || email.length < 3 || email.length > 254) {
    return { ok: false, error: "Enter a valid email address." };
  }

  await ensureNewsletterSchema();
  const sql = getSql();

  try {
    const existing = (await sql`
      SELECT id FROM newsletter_subscribers WHERE email = ${email} LIMIT 1
    `) as { id: number }[];

    if (existing.length > 0) {
      return { ok: true, alreadySubscribed: true };
    }

    await sql`
      INSERT INTO newsletter_subscribers (email, confirmed)
      VALUES (${email}, false)
    `;
    return { ok: true, alreadySubscribed: false };
  } catch (error) {
    console.error("[newsletter] subscribe failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
