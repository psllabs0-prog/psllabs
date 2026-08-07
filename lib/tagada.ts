import { getSql } from "@/lib/db/sql";
import { ensureInventorySchema } from "@/lib/inventory/store";
import type { CatalogProduct } from "@/lib/products/catalog";
import { getCatalogProductByHandle } from "@/lib/products/catalog";

const TAGADA_API_BASE = "https://api.tagada.io";

export function getTagadaStoreId(): string {
  const id = process.env.TAGADA_STORE_ID?.trim();
  if (!id) throw new Error("TAGADA_STORE_ID is not configured.");
  return id;
}

export function getTagadaApiKey(): string {
  const key = process.env.TAGADA_API_KEY?.trim();
  if (!key) throw new Error("TAGADA_API_KEY is not configured.");
  return key;
}

export function isTagadaConfigured(): boolean {
  return Boolean(
    process.env.TAGADA_API_KEY?.trim() && process.env.TAGADA_STORE_ID?.trim()
  );
}

export function dollarsToCents(usd: number): number {
  return Math.round(usd * 100);
}

export function gramsForHandle(handle: string): number {
  if (handle === "ghk-cu") return 50;
  return 10;
}

export type TagadaSyncProductInput = {
  handle: string;
  name: string;
  strength: string;
  description: string;
  sku: string;
  priceUsd: number;
  active: boolean;
};

export type TagadaSyncResult =
  | {
      ok: true;
      handle: string;
      tagadaProductId: string;
      tagadaVariantId: string;
      tagadaPriceId: string;
    }
  | { ok: false; handle: string; error: string };

async function ensureTagadaProductColumns(): Promise<void> {
  await ensureInventorySchema();
  const sql = getSql();
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS tagada_product_id VARCHAR
  `;
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS tagada_variant_id VARCHAR
  `;
  await sql`
    ALTER TABLE products
    ADD COLUMN IF NOT EXISTS tagada_price_id VARCHAR
  `;
}

export function catalogToTagadaInput(
  product: CatalogProduct
): TagadaSyncProductInput {
  return {
    handle: product.handle,
    name: product.name,
    strength: product.strength,
    description: product.description,
    sku: product.sku,
    priceUsd: product.price,
    active: product.status === "active",
  };
}

/** Redact a secret for logs: first 6 + last 4 chars only. */
function maskSecret(value: string): string {
  if (value.length <= 10) return "[redacted-short]";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/**
 * Create (or re-create) a Tagada catalog product and persist returned IDs
 * on the local products row.
 */
export async function syncProductToTagada(
  product: TagadaSyncProductInput
): Promise<TagadaSyncResult> {
  await ensureTagadaProductColumns();

  const storeId = getTagadaStoreId();
  const apiKey = getTagadaApiKey();
  const displayName = `${product.name} ${product.strength}`.trim();
  const amountCents = dollarsToCents(product.priceUsd);

  const payload = {
    storeId,
    name: displayName,
    description: product.description,
    active: product.active,
    isShippable: true,
    isTaxable: false,
    variants: [
      {
        name: displayName,
        description: product.description,
        sku: product.sku,
        grams: gramsForHandle(product.handle),
        active: true,
        default: true,
        prices: [
          {
            currencyOptions: {
              USD: { amount: amountCents, currency: "USD" },
            },
            recurring: false,
            billingTiming: "usage",
            default: true,
          },
        ],
      },
    ],
  };

  const url = `${TAGADA_API_BASE}/api/public/v1/products/create`;
  const authorizationValue = `Bearer ${apiKey}`;
  const requestBody = JSON.stringify(payload);

  console.info(`[tagada] sync start handle=${product.handle}`);
  console.info(`[tagada] request URL: ${url}`);
  console.info(
    `[tagada] Authorization header value (masked): ${maskSecret(authorizationValue)}`
  );
  console.info(`[tagada] request body:`, requestBody);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authorizationValue,
        "Content-Type": "application/json",
      },
      body: requestBody,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown network error";
    console.error(
      `[tagada] NETWORK error calling products/create handle=${product.handle}:`,
      message
    );
    if (error instanceof Error && error.stack) {
      console.error(`[tagada] NETWORK stack:`, error.stack);
    }
    return { ok: false, handle: product.handle, error: message };
  }

  try {
    const rawText = await response.text();
    let data: unknown = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = { raw: rawText };
    }

    console.info(
      `[tagada] products/create status=${response.status} handle=${product.handle}`,
      data
    );

    if (!response.ok) {
      console.error(
        `[tagada] API error handle=${product.handle} status=${response.status} body=`,
        rawText
      );
      const message =
        typeof data === "object" &&
        data &&
        "message" in data &&
        typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : `Tagada product create failed (${response.status})`;
      return { ok: false, handle: product.handle, error: message };
    }

    const body = data as {
      id?: string;
      variants?: Array<{
        id?: string;
        prices?: Array<{ id?: string }>;
      }>;
    };

    const tagadaProductId = body.id ?? "";
    const tagadaVariantId = body.variants?.[0]?.id ?? "";
    const tagadaPriceId = body.variants?.[0]?.prices?.[0]?.id ?? "";

    if (!tagadaProductId || !tagadaVariantId || !tagadaPriceId) {
      console.error(
        `[tagada] API success but missing ids handle=${product.handle} body=`,
        rawText
      );
      return {
        ok: false,
        handle: product.handle,
        error: "Tagada response missing product/variant/price ids.",
      };
    }

    const sql = getSql();
    await sql`
      INSERT INTO products (handle, name, stock, tagada_product_id, tagada_variant_id, tagada_price_id)
      VALUES (
        ${product.handle},
        ${displayName},
        0,
        ${tagadaProductId},
        ${tagadaVariantId},
        ${tagadaPriceId}
      )
      ON CONFLICT (handle) DO UPDATE SET
        name = EXCLUDED.name,
        tagada_product_id = EXCLUDED.tagada_product_id,
        tagada_variant_id = EXCLUDED.tagada_variant_id,
        tagada_price_id = EXCLUDED.tagada_price_id
    `;

    console.info(
      `[tagada] sync OK handle=${product.handle} product=${tagadaProductId} variant=${tagadaVariantId} price=${tagadaPriceId}`
    );

    return {
      ok: true,
      handle: product.handle,
      tagadaProductId,
      tagadaVariantId,
      tagadaPriceId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Tagada sync error";
    console.error(
      `[tagada] post-response processing error handle=${product.handle}:`,
      message
    );
    if (error instanceof Error && error.stack) {
      console.error(`[tagada] processing stack:`, error.stack);
    }
    return { ok: false, handle: product.handle, error: message };
  }
}

export type ProductTagadaIds = {
  handle: string;
  tagadaProductId: string;
  tagadaVariantId: string;
  tagadaPriceId: string;
};

export async function getTagadaIdsForHandle(
  handle: string
): Promise<ProductTagadaIds | null> {
  await ensureTagadaProductColumns();
  const sql = getSql();
  const rows = (await sql`
    SELECT handle, tagada_product_id, tagada_variant_id, tagada_price_id
    FROM products
    WHERE handle = ${handle}
    LIMIT 1
  `) as Array<{
    handle: string;
    tagada_product_id: string | null;
    tagada_variant_id: string | null;
    tagada_price_id: string | null;
  }>;

  const row = rows[0];
  if (
    !row?.tagada_product_id ||
    !row.tagada_variant_id ||
    !row.tagada_price_id
  ) {
    return null;
  }

  return {
    handle: row.handle,
    tagadaProductId: row.tagada_product_id,
    tagadaVariantId: row.tagada_variant_id,
    tagadaPriceId: row.tagada_price_id,
  };
}

/** Ensure catalog metadata exists for a handle when syncing from inventory. */
export function resolveCatalogProduct(handle: string): CatalogProduct | null {
  return getCatalogProductByHandle(handle) ?? null;
}
