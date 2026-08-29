import { NextResponse } from "next/server";

import { getAvailabilityForHandles } from "@/lib/inventory/store";

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
