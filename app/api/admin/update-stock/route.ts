import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import {
  ensureProductTracked,
  setProductStockBySku,
} from "@/lib/inventory/store";
import { getCatalogProducts } from "@/lib/products/catalog";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  let body: { sku?: unknown; new_stock?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const sku = typeof body.sku === "string" ? body.sku.trim().toUpperCase() : "";
  const newStock =
    typeof body.new_stock === "number"
      ? body.new_stock
      : Number(body.new_stock);

  if (!sku || !Number.isInteger(newStock) || newStock < 0) {
    return NextResponse.json(
      { error: "Valid SKU and non-negative stock are required." },
      { status: 400 }
    );
  }

  const catalogProduct = getCatalogProducts().find(
    (product) => product.sku.toUpperCase() === sku
  );
  if (!catalogProduct) {
    return NextResponse.json({ error: "Unknown SKU." }, { status: 404 });
  }

  try {
    await ensureProductTracked(
      catalogProduct.handle,
      catalogProduct.name,
      catalogProduct.sku
    );
    const updated = await setProductStockBySku(catalogProduct.sku, newStock);
    return NextResponse.json({ ok: true, product: updated });
  } catch (error) {
    console.error("[admin/update-stock]", error);
    return NextResponse.json(
      { error: "Unable to update stock." },
      { status: 500 }
    );
  }
}
