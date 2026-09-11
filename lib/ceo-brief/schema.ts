import { getSql } from "@/lib/db/sql";

export const CEO_BRIEF_TABLES = ["ceo_weekly_briefs"] as const;

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
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (period_start, period_end)
        )
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
