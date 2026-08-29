import { NextResponse } from "next/server";

import { verifyCronRequest } from "@/lib/cron/auth";
import { sendDeliveryFollowupEmail } from "@/lib/email/delivery-followup";
import {
  claimDeliveryFollowupEmail,
  getOrdersDueForDeliveryFollowup,
  markDeliveryFollowupSent,
  releaseDeliveryFollowupClaim,
} from "@/lib/orders/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  try {
    const orders = await getOrdersDueForDeliveryFollowup(50);
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const order of orders) {
      if (!(await claimDeliveryFollowupEmail(order.orderId))) {
        skipped += 1;
        continue;
      }

      try {
        await sendDeliveryFollowupEmail(order);
        await markDeliveryFollowupSent(order.orderId);
        sent += 1;
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : "delivery follow-up failed";
        console.error(
          `[cron/delivery-followup] failed for ${order.orderId}:`,
          message
        );
        await releaseDeliveryFollowupClaim(order.orderId);
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
    console.error("[cron/delivery-followup] job error:", error);
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}
