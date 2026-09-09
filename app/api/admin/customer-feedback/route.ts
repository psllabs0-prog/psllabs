import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import {
  discoverySourceLabel,
  purchaseDriverLabel,
} from "@/lib/customer-intelligence/constants";
import { listCustomerFeedback } from "@/lib/customer-intelligence/store";

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
    const rows = await listCustomerFeedback(300);

    if (format === "csv") {
      const header = [
        "order_id",
        "submitted_at",
        "discovery_source_stated",
        "purchase_drivers",
        "open_feedback",
        "status",
        "survey_version",
        "submitted_from",
      ];
      const lines = [
        header.join(","),
        ...rows.map((row) =>
          [
            csvEscape(row.orderId),
            csvEscape(row.submittedAt),
            csvEscape(row.discoverySourceStated ?? ""),
            csvEscape(
              row.purchaseDrivers.map((d) => purchaseDriverLabel(d)).join("; ")
            ),
            csvEscape(row.openFeedback ?? ""),
            csvEscape(row.status),
            csvEscape(row.surveyVersion),
            csvEscape(row.submittedFrom),
          ].join(",")
        ),
      ];

      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="customer-feedback-v1.csv"',
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({
      rows: rows.map((row) => ({
        ...row,
        discoverySourceLabel: discoverySourceLabel(row.discoverySourceStated),
        purchaseDriverLabels: row.purchaseDrivers.map((d) =>
          purchaseDriverLabel(d)
        ),
      })),
    });
  } catch (error) {
    console.error("[admin/customer-feedback]", error);
    return NextResponse.json(
      { error: "Unable to load customer feedback." },
      { status: 500 }
    );
  }
}
