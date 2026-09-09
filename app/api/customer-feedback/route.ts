import { NextResponse } from "next/server";

import {
  CUSTOMER_FEEDBACK_SURVEY_VERSION,
  DISCOVERY_SOURCE_VALUES,
  OPEN_FEEDBACK_MAX_LENGTH,
  PURCHASE_DRIVER_VALUES,
  type DiscoverySourceValue,
  type PurchaseDriverValue,
} from "@/lib/customer-intelligence/constants";
import {
  getCustomerFeedbackStatus,
  recordCustomerFeedback,
} from "@/lib/customer-intelligence/store";
import { getOrder } from "@/lib/orders/store";

export const runtime = "nodejs";

const ORDER_ID_RE = /^psl_\d+_[a-z0-9]+$/i;

function isEligibleOrderStatus(status: string): boolean {
  return status === "paid" || status === "shipped";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = (searchParams.get("orderId") ?? "").trim();

  if (!orderId || !ORDER_ID_RE.test(orderId)) {
    return NextResponse.json({ error: "Invalid order." }, { status: 400 });
  }

  try {
    const order = await getOrder(orderId);
    if (!order || !isEligibleOrderStatus(order.status)) {
      return NextResponse.json({ show: false, recorded: null });
    }

    const recorded = await getCustomerFeedbackStatus(
      orderId,
      CUSTOMER_FEEDBACK_SURVEY_VERSION
    );

    return NextResponse.json({
      show: recorded === null,
      recorded,
    });
  } catch (error) {
    console.error("[customer-feedback] GET failed:", error);
    return NextResponse.json({ show: false, recorded: null });
  }
}

export async function POST(request: Request) {
  let body: {
    orderId?: unknown;
    action?: unknown;
    discoverySource?: unknown;
    purchaseDrivers?: unknown;
    openFeedback?: unknown;
    website?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      {
        error:
          "We couldn't save that feedback. Your order is already confirmed.",
      },
      { status: 400 }
    );
  }

  // Honeypot — bots only
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, alreadyRecorded: true });
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const action = body.action === "skip" ? "skip" : body.action === "submit" ? "submit" : null;

  if (!orderId || !ORDER_ID_RE.test(orderId) || !action) {
    return NextResponse.json(
      {
        error:
          "We couldn't save that feedback. Your order is already confirmed.",
      },
      { status: 400 }
    );
  }

  let order;
  try {
    order = await getOrder(orderId);
  } catch (error) {
    console.error("[customer-feedback] order lookup failed:", error);
    return NextResponse.json(
      {
        error:
          "We couldn't save that feedback. Your order is already confirmed.",
      },
      { status: 500 }
    );
  }

  if (!order || !isEligibleOrderStatus(order.status)) {
    return NextResponse.json(
      {
        error:
          "We couldn't save that feedback. Your order is already confirmed.",
      },
      { status: 400 }
    );
  }

  if (action === "skip") {
    const result = await recordCustomerFeedback({ orderId, action: "skip" });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      alreadyRecorded: result.alreadyRecorded,
    });
  }

  let discoverySource: DiscoverySourceValue | null = null;
  if (
    typeof body.discoverySource === "string" &&
    body.discoverySource.trim() !== ""
  ) {
    if (!DISCOVERY_SOURCE_VALUES.has(body.discoverySource)) {
      return NextResponse.json(
        {
          error:
            "We couldn't save that feedback. Your order is already confirmed.",
        },
        { status: 400 }
      );
    }
    discoverySource = body.discoverySource as DiscoverySourceValue;
  }

  const purchaseDrivers: PurchaseDriverValue[] = [];
  if (Array.isArray(body.purchaseDrivers)) {
    for (const raw of body.purchaseDrivers) {
      if (typeof raw !== "string") continue;
      if (!PURCHASE_DRIVER_VALUES.has(raw)) {
        return NextResponse.json(
          {
            error:
              "We couldn't save that feedback. Your order is already confirmed.",
          },
          { status: 400 }
        );
      }
      if (!purchaseDrivers.includes(raw as PurchaseDriverValue)) {
        purchaseDrivers.push(raw as PurchaseDriverValue);
      }
    }
  }

  if (purchaseDrivers.length > 2) {
    return NextResponse.json(
      {
        error:
          "We couldn't save that feedback. Your order is already confirmed.",
      },
      { status: 400 }
    );
  }

  let openFeedback: string | null = null;
  if (typeof body.openFeedback === "string") {
    const trimmed = body.openFeedback.trim();
    if (trimmed.length > OPEN_FEEDBACK_MAX_LENGTH) {
      return NextResponse.json(
        {
          error:
            "We couldn't save that feedback. Your order is already confirmed.",
        },
        { status: 400 }
      );
    }
    openFeedback = trimmed.length > 0 ? trimmed : null;
  }

  const result = await recordCustomerFeedback({
    orderId,
    action: "submit",
    discoverySource,
    purchaseDrivers,
    openFeedback,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: result.status,
    alreadyRecorded: result.alreadyRecorded,
  });
}
