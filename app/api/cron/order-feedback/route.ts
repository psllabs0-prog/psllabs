import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { sendOrderFeedbackEmail } from "@/lib/email/order-feedback";
import {
  claimFeedbackEmail,
  getOrdersDueForFeedbackEmail,
  markFeedbackEmailSent,
  releaseFeedbackEmailClaim,
} from "@/lib/orders/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const orders = await getOrdersDueForFeedbackEmail(50);
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const order of orders) {
      if (!(await claimFeedbackEmail(order.orderId))) {
        skipped += 1;
        continue;
      }

      try {
        await sendOrderFeedbackEmail(order);
        await markFeedbackEmailSent(order.orderId);
        sent += 1;
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : "feedback email failed";
        console.error(
          `[cron/order-feedback] failed for ${order.orderId}:`,
          message
        );
        await releaseFeedbackEmailClaim(order.orderId);
      }
    }

    return NextResponse.json({
      ok: true,
      candidates: orders.length,
      sent,
      failed,
      skipped,
    });
  } catch (error) {
    console.error("[cron/order-feedback] job error:", error);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
