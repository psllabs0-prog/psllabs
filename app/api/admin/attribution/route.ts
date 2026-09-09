import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { listOrdersWithAttribution } from "@/lib/orders/store";

export const runtime = "nodejs";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");

  try {
    const rows = await listOrdersWithAttribution(300);

    if (format === "csv") {
      const header = [
        "order_id",
        "status",
        "total",
        "paid_at",
        "products",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "landing_page",
        "first_paid_touch_at",
        "last_paid_touch_at",
      ];
      const lines = [
        header.join(","),
        ...rows.map((row) =>
          [
            csvEscape(row.orderId),
            csvEscape(row.status),
            csvEscape(String(row.total)),
            csvEscape(row.paidAt ?? ""),
            csvEscape(row.products),
            csvEscape(row.utmSource ?? ""),
            csvEscape(row.utmMedium ?? ""),
            csvEscape(row.utmCampaign ?? ""),
            csvEscape(row.utmContent ?? ""),
            csvEscape(row.utmTerm ?? ""),
            csvEscape(row.landingPage ?? ""),
            csvEscape(row.firstPaidTouchAt ?? ""),
            csvEscape(row.lastPaidTouchAt ?? ""),
          ].join(",")
        ),
      ];

      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="order-attribution.csv"',
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({ rows });
  } catch (error) {
    console.error("[admin/attribution]", error);
    return NextResponse.json(
      { error: "Unable to load attribution." },
      { status: 500 }
    );
  }
}
