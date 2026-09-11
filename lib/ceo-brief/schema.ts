import { getSql } from "@/lib/db/sql";

export const CEO_BRIEF_TABLES = ["ceo_weekly_briefs"] as const;

/** Live email-send lease window before another worker may reclaim. */
export const CEO_BRIEF_EMAIL_CLAIM_STALE_MINUTES = 15;

let schemaReady: Promise<void> | null = null;

export async function ensureCeoBriefSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS ceo_weekly_briefs (
          id BIGSERIAL PRIMARY KEY,
          period_start TIMESTAMPTZ NOT NULL,
          period_end TIMESTAMPTZ NOT NULL,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          brief_json JSONB NOT NULL,
          executive_summary TEXT NOT NULL,
          actions_json JSONB NOT NULL,
          email_sent_at TIMESTAMPTZ,
          email_send_claimed_at TIMESTAMPTZ,
          email_send_last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (period_start, period_end)
        )
      `;
      await sql`
        ALTER TABLE ceo_weekly_briefs
        ADD COLUMN IF NOT EXISTS email_send_claimed_at TIMESTAMPTZ
      `;
      await sql`
        ALTER TABLE ceo_weekly_briefs
        ADD COLUMN IF NOT EXISTS email_send_last_error TEXT
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS ceo_weekly_briefs_generated_at_idx
        ON ceo_weekly_briefs (generated_at DESC)
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}
