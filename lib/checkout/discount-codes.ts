import { getSql } from "@/lib/db/sql";

export type DiscountCodeRow = {
  code: string;
  discountPercent: number;
  active: boolean;
  expiresAt: string | null;
};

let schemaReady: Promise<void> | null = null;

export function normalizeDiscountCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export async function ensureDiscountCodesSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  const sql = getSql();
  schemaReady = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS discount_codes (
        code              TEXT PRIMARY KEY,
        discount_percent  INTEGER NOT NULL,
        active            BOOLEAN NOT NULL DEFAULT true,
        expires_at        TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT discount_codes_percent_check
          CHECK (discount_percent > 0 AND discount_percent <= 100)
      )
    `;

    // Seed launch codes — idempotent; do not overwrite existing rows.
    await sql`
      INSERT INTO discount_codes (code, discount_percent, active, expires_at)
      VALUES
        ('SUMMER20', 20, true, NULL),
        ('GRANDOPEN20', 20, true, NULL)
      ON CONFLICT (code) DO NOTHING
    `;
  })();
  return schemaReady;
}

/**
 * Look up a normalized code. Returns null when missing, inactive, or expired.
 */
export async function lookupActiveDiscountCode(
  rawCode: string
): Promise<DiscountCodeRow | null> {
  const code = normalizeDiscountCode(rawCode);
  if (!code) return null;

  await ensureDiscountCodesSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT code, discount_percent, active, expires_at
    FROM discount_codes
    WHERE code = ${code}
    LIMIT 1
  `) as {
    code: string;
    discount_percent: number;
    active: boolean;
    expires_at: string | null;
  }[];

  const row = rows[0];
  if (!row || !row.active) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return {
    code: row.code,
    discountPercent: Number(row.discount_percent),
    active: row.active,
    expiresAt: row.expires_at
      ? new Date(row.expires_at).toISOString()
      : null,
  };
}
