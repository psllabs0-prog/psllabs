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
      action: "created" | "updated";
      tagadaProductId: string;
      tagadaVariantId: string;
      tagadaPriceId: string;
    }
  | { ok: false; handle: string; error: string };

export type StoredTagadaRecord = {
  handle: string;
  tagadaProductId: string | null;
  tagadaVariantId: string | null;
  tagadaPriceId: string | null;
};

type TagadaProductResponse = {
  id?: string;
  variants?: Array<{
    id?: string;
    default?: boolean;
    sku?: string;
    prices?: Array<{
      id?: string;
      default?: boolean;
      currencyOptions?: {
        USD?: { amount?: number; currency?: string };
      };
    }>;
  }>;
};

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

function parseApiErrorMessage(data: unknown, fallback: string): string {
  if (
    typeof data === "object" &&
    data &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string"
  ) {
    return (data as { message: string }).message;
  }
  return fallback;
}

function extractIdsFromProductBody(body: TagadaProductResponse): {
  tagadaProductId: string;
  tagadaVariantId: string;
  tagadaPriceId: string;
} | null {
  const tagadaProductId = body.id ?? "";
  const variant =
    body.variants?.find((v) => v.default) ?? body.variants?.[0] ?? null;
  const tagadaVariantId = variant?.id ?? "";
  const price =
    variant?.prices?.find((p) => p.default) ?? variant?.prices?.[0] ?? null;
  const tagadaPriceId = price?.id ?? "";

  if (!tagadaProductId || !tagadaVariantId || !tagadaPriceId) {
    return null;
  }

  return { tagadaProductId, tagadaVariantId, tagadaPriceId };
}

function extractRemotePriceCents(body: TagadaProductResponse): number | null {
  const variant =
    body.variants?.find((v) => v.default) ?? body.variants?.[0] ?? null;
  const price =
    variant?.prices?.find((p) => p.default) ?? variant?.prices?.[0] ?? null;
  return price?.currencyOptions?.USD?.amount ?? null;
}

async function tagadaApiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
  rawText: string;
}> {
  const apiKey = getTagadaApiKey();
  const authorizationValue = `Bearer ${apiKey}`;
  const url = `${TAGADA_API_BASE}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: authorizationValue,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown network error";
    throw new Error(message);
  }

  const rawText = await response.text();
  let data: unknown = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { raw: rawText };
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    rawText,
  };
}

function buildCreatePayload(
  product: TagadaSyncProductInput,
  displayName: string,
  amountCents: number
) {
  const storeId = getTagadaStoreId();
  return {
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
}

async function persistTagadaIds(
  handle: string,
  displayName: string,
  ids: {
    tagadaProductId: string;
    tagadaVariantId: string;
    tagadaPriceId: string;
  }
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO products (handle, name, stock, tagada_product_id, tagada_variant_id, tagada_price_id)
    VALUES (
      ${handle},
      ${displayName},
      0,
      ${ids.tagadaProductId},
      ${ids.tagadaVariantId},
      ${ids.tagadaPriceId}
    )
    ON CONFLICT (handle) DO UPDATE SET
      name = EXCLUDED.name,
      tagada_product_id = EXCLUDED.tagada_product_id,
      tagada_variant_id = EXCLUDED.tagada_variant_id,
      tagada_price_id = EXCLUDED.tagada_price_id
  `;
}

async function updateExistingTagadaProduct(
  product: TagadaSyncProductInput,
  existingProductId: string,
  displayName: string,
  amountCents: number
): Promise<TagadaSyncResult> {
  console.info(
    `[tagada] updating existing product handle=${product.handle} productId=${existingProductId}`
  );

  const updateResponse = await tagadaApiRequest(
    "PUT",
    `/api/public/v1/products/${encodeURIComponent(existingProductId)}`,
    {
      updatedData: {
        name: displayName,
        description: product.description,
        active: product.active,
        isShippable: true,
        isTaxable: false,
      },
    }
  );

  console.info(
    `[tagada] products/update status=${updateResponse.status} handle=${product.handle}`,
    updateResponse.data
  );

  if (updateResponse.status === 404) {
    console.warn(
      `[tagada] stored product ${existingProductId} not found in Tagada for handle=${product.handle}; will create a replacement`
    );
    return createNewTagadaProduct(product, displayName, amountCents);
  }

  if (!updateResponse.ok) {
    return {
      ok: false,
      handle: product.handle,
      error: parseApiErrorMessage(
        updateResponse.data,
        `Tagada product update failed (${updateResponse.status})`
      ),
    };
  }

  const getResponse = await tagadaApiRequest(
    "GET",
    `/api/public/v1/products/${encodeURIComponent(existingProductId)}`
  );

  if (!getResponse.ok) {
    const updatedBody = updateResponse.data as TagadaProductResponse;
    const idsFromUpdate = extractIdsFromProductBody(updatedBody);
    if (idsFromUpdate) {
      await persistTagadaIds(product.handle, displayName, idsFromUpdate);
      return {
        ok: true,
        handle: product.handle,
        action: "updated",
        ...idsFromUpdate,
      };
    }

    return {
      ok: false,
      handle: product.handle,
      error: parseApiErrorMessage(
        getResponse.data,
        `Tagada product retrieve failed after update (${getResponse.status})`
      ),
    };
  }

  const remoteBody = getResponse.data as TagadaProductResponse;
  const ids = extractIdsFromProductBody(remoteBody);
  if (!ids) {
    return {
      ok: false,
      handle: product.handle,
      error: "Tagada update succeeded but response missing product/variant/price ids.",
    };
  }

  const remotePriceCents = extractRemotePriceCents(remoteBody);
  if (remotePriceCents !== null && remotePriceCents !== amountCents) {
    console.warn(
      `[tagada] price mismatch for handle=${product.handle}: Tagada has ${remotePriceCents} cents but catalog expects ${amountCents} cents. Tagada's public API does not expose a price-update endpoint — update the price in the Tagada dashboard or delete the product and re-sync.`
    );
  }

  await persistTagadaIds(product.handle, displayName, ids);

  console.info(
    `[tagada] sync OK (updated) handle=${product.handle} product=${ids.tagadaProductId} variant=${ids.tagadaVariantId} price=${ids.tagadaPriceId}`
  );

  return {
    ok: true,
    handle: product.handle,
    action: "updated",
    ...ids,
  };
}

async function createNewTagadaProduct(
  product: TagadaSyncProductInput,
  displayName: string,
  amountCents: number
): Promise<TagadaSyncResult> {
  const payload = buildCreatePayload(product, displayName, amountCents);
  const url = "/api/public/v1/products/create";

  console.info(`[tagada] creating new product handle=${product.handle}`);
  console.info(`[tagada] request URL: ${TAGADA_API_BASE}${url}`);
  console.info(
    `[tagada] Authorization header value (masked): ${maskSecret(`Bearer ${getTagadaApiKey()}`)}`
  );
  console.info(`[tagada] request body:`, JSON.stringify(payload));

  let response: Awaited<ReturnType<typeof tagadaApiRequest>>;
  try {
    response = await tagadaApiRequest("POST", url, payload);
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

  console.info(
    `[tagada] products/create status=${response.status} handle=${product.handle}`,
    response.data
  );

  if (!response.ok) {
    console.error(
      `[tagada] API error handle=${product.handle} status=${response.status} body=`,
      response.rawText
    );
    return {
      ok: false,
      handle: product.handle,
      error: parseApiErrorMessage(
        response.data,
        `Tagada product create failed (${response.status})`
      ),
    };
  }

  const ids = extractIdsFromProductBody(response.data as TagadaProductResponse);
  if (!ids) {
    console.error(
      `[tagada] API success but missing ids handle=${product.handle} body=`,
      response.rawText
    );
    return {
      ok: false,
      handle: product.handle,
      error: "Tagada response missing product/variant/price ids.",
    };
  }

  await persistTagadaIds(product.handle, displayName, ids);

  console.info(
    `[tagada] sync OK (created) handle=${product.handle} product=${ids.tagadaProductId} variant=${ids.tagadaVariantId} price=${ids.tagadaPriceId}`
  );

  return {
    ok: true,
    handle: product.handle,
    action: "created",
    ...ids,
  };
}

/**
 * Sync a catalog product to Tagada. Updates an existing remote product when
 * tagada_product_id is stored locally; otherwise creates a new one.
 */
export async function syncProductToTagada(
  product: TagadaSyncProductInput
): Promise<TagadaSyncResult> {
  await ensureTagadaProductColumns();

  const displayName = `${product.name} ${product.strength}`.trim();
  const amountCents = dollarsToCents(product.priceUsd);
  const stored = await getStoredTagadaRecord(product.handle);

  if (stored?.tagadaProductId) {
    return updateExistingTagadaProduct(
      product,
      stored.tagadaProductId,
      displayName,
      amountCents
    );
  }

  console.info(
    `[tagada] no stored tagada_product_id for handle=${product.handle}; creating new Tagada product`
  );
  return createNewTagadaProduct(product, displayName, amountCents);
}

export type ProductTagadaIds = {
  handle: string;
  tagadaProductId: string;
  tagadaVariantId: string;
  tagadaPriceId: string;
};

export async function getStoredTagadaRecord(
  handle: string
): Promise<StoredTagadaRecord | null> {
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
  if (!row) return null;

  return {
    handle: row.handle,
    tagadaProductId: row.tagada_product_id,
    tagadaVariantId: row.tagada_variant_id,
    tagadaPriceId: row.tagada_price_id,
  };
}

export async function getAllStoredTagadaRecords(): Promise<
  Map<string, StoredTagadaRecord>
> {
  await ensureTagadaProductColumns();
  const sql = getSql();
  const rows = (await sql`
    SELECT handle, tagada_product_id, tagada_variant_id, tagada_price_id
    FROM products
  `) as Array<{
    handle: string;
    tagada_product_id: string | null;
    tagada_variant_id: string | null;
    tagada_price_id: string | null;
  }>;

  return new Map(
    rows.map((row) => [
      row.handle,
      {
        handle: row.handle,
        tagadaProductId: row.tagada_product_id,
        tagadaVariantId: row.tagada_variant_id,
        tagadaPriceId: row.tagada_price_id,
      },
    ])
  );
}

export async function getTagadaIdsForHandle(
  handle: string
): Promise<ProductTagadaIds | null> {
  const row = await getStoredTagadaRecord(handle);
  if (
    !row?.tagadaProductId ||
    !row.tagadaVariantId ||
    !row.tagadaPriceId
  ) {
    return null;
  }

  return {
    handle: row.handle,
    tagadaProductId: row.tagadaProductId,
    tagadaVariantId: row.tagadaVariantId,
    tagadaPriceId: row.tagadaPriceId,
  };
}

/** Ensure catalog metadata exists for a handle when syncing from inventory. */
export function resolveCatalogProduct(handle: string): CatalogProduct | null {
  return getCatalogProductByHandle(handle) ?? null;
}
