import { NextResponse } from "next/server";

import { lookupActiveDiscountCode } from "@/lib/checkout/discount-codes";
import { computeTotals } from "@/lib/checkout/totals";

export const runtime = "nodejs";

type Body = {
  code?: unknown;
  subtotal?: unknown;
};

/**
 * Preview/validate a discount code for the checkout UI.
 * Checkout create routes re-validate independently — never trust client amounts.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "Invalid request format." },
      { status: 400 }
    );
  }

  const rawCode = typeof body.code === "string" ? body.code : "";
  if (!rawCode.trim()) {
    return NextResponse.json(
      { error: "Invalid or expired code" },
      { status: 400 }
    );
  }

  const subtotal =
    typeof body.subtotal === "number" && Number.isFinite(body.subtotal)
      ? body.subtotal
      : 0;

  try {
    const discount = await lookupActiveDiscountCode(rawCode);
    if (!discount) {
      return NextResponse.json(
        { error: "Invalid or expired code" },
        { status: 400 }
      );
    }

    const totals = computeTotals(subtotal, "", {
      code: discount.code,
      percent: discount.discountPercent,
    });

    return NextResponse.json({
      code: discount.code,
      discountPercent: discount.discountPercent,
      discountAmount: totals.discountAmount,
    });
  } catch (error) {
    console.error("[apply-discount] lookup failed:", error);
    return NextResponse.json(
      { error: "Unable to validate discount code. Please try again." },
      { status: 500 }
    );
  }
}
