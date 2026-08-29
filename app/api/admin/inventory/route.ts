import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import {
  ensureProductTracked,
  getAdminInventoryProductRows,
} from "@/lib/inventory/store";
import { getCatalogProducts } from "@/lib/products/catalog";

export const runtime = "nodejs";

export async function GET() {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  try {
    for (const product of getCatalogProducts()) {
      await ensureProductTracked(product.handle, product.name, product.sku);
    }

    const products = await getAdminInventoryProductRows();
    return NextResponse.json({ products });
  } catch (error) {
    console.error("[admin/inventory]", error);
    return NextResponse.json(
      { error: "Unable to load inventory." },
      { status: 500 }
    );
  }
}
