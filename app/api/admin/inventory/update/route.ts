import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/admin/auth";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { setProductStock } from "@/lib/inventory/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { handle?: unknown; stock?: unknown };
  try {
    body = (await request.json()) as { handle?: unknown; stock?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const handle = typeof body.handle === "string" ? body.handle.trim() : "";
  const stock = typeof body.stock === "number" ? body.stock : Number(body.stock);

  if (!handle || !Number.isInteger(stock) || stock < 0) {
    return NextResponse.json({ error: "Invalid handle or stock." }, { status: 400 });
  }

  const catalog = getCatalogProductByHandle(handle);
  if (!catalog || catalog.status !== "active") {
    return NextResponse.json({ error: "Unknown active product." }, { status: 404 });
  }

  try {
    await setProductStock(handle, catalog.name, stock, catalog.sku);
    return NextResponse.json({ ok: true, stock });
  } catch (error) {
    console.error("[admin/inventory/update]", error);
    return NextResponse.json({ error: "Unable to update stock." }, { status: 500 });
  }
}
