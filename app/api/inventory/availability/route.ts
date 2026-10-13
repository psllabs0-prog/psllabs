import { NextResponse } from "next/server";

import { getAvailabilityForHandles } from "@/lib/inventory/store";
import { getCatalogProductByHandle } from "@/lib/products/catalog";
import { isDesignPreview } from "@/lib/design-preview";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const handlesParam = searchParams.get("handles")?.trim() ?? "";
  const handles = handlesParam
    .split(",")
    .map((handle) => handle.trim())
    .filter(Boolean);

  if (handles.length === 0) {
    return NextResponse.json({ availability: [] });
  }
  if (isDesignPreview()) {
    const availability = [...new Set(handles)].slice(0, 20).flatMap((handle) => {
      const product = getCatalogProductByHandle(handle);
      return product?.status === "active" ? [{ handle, tracked: false, stock: 0, reserved: 0,
        available: 9999, status: "in_stock" }] : [];
    });
    return NextResponse.json({ availability, previewOnly: true },
      { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const availability = await getAvailabilityForHandles(handles);
    return NextResponse.json(
      { availability },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[inventory/availability]", error);
    return NextResponse.json(
      { error: "Unable to load inventory." },
      { status: 500 }
    );
  }
}
