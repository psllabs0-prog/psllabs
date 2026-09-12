import { getSql } from "@/lib/db/sql";

export const AUTHORITY_TABLES = [
  "authority_opportunities",
  "content_briefs",
] as const;

let schemaReady: Promise<void> | null = null;

export async function ensureAuthoritySchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();

      await sql`
        CREATE TABLE IF NOT EXISTS authority_opportunities (
          id BIGSERIAL PRIMARY KEY,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'suggested',
          primary_query TEXT NOT NULL DEFAULT '',
          page TEXT NOT NULL DEFAULT '',
          evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          priority_score NUMERIC(10,2) NOT NULL DEFAULT 0,
          intent TEXT NOT NULL DEFAULT 'informational',
          risk_level TEXT NOT NULL DEFAULT 'LOW',
          detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          approved_at TIMESTAMPTZ,
          dismissed_at TIMESTAMPTZ,
          opportunity_key TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (opportunity_key)
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS authority_opportunities_status_idx
        ON authority_opportunities (status, priority_score DESC)
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS content_briefs (
          id BIGSERIAL PRIMARY KEY,
          opportunity_id BIGINT NOT NULL REFERENCES authority_opportunities(id),
          title TEXT NOT NULL DEFAULT '',
          slug_or_target_page TEXT NOT NULL DEFAULT '',
          brief_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          risk_level TEXT NOT NULL DEFAULT 'LOW',
          claims_review_required BOOLEAN NOT NULL DEFAULT false,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          approved_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS content_briefs_opportunity_idx
        ON content_briefs (opportunity_id, generated_at DESC)
      `;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}
