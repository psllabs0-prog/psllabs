import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { getBtcpostagePublicConfig } from "@/lib/btcpostage/config";
import { ensureBtcpostageSchema } from "@/lib/btcpostage/schema";
import {
  getOrderLabelPublic,
  getOrderRates,
  recoverOrderPurchase,
  verifyOrderAddress,
} from "@/lib/btcpostage/service";
import { getBtcpostageLabel, toPublicLabel } from "@/lib/btcpostage/store";
import type { BtcpostagePackage } from "@/lib/btcpostage/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

function parsePackage(body: Record<string, unknown>): Partial<BtcpostagePackage> {
  return {
    weightLbs:
      typeof body.weightLbs === "number"
        ? body.weightLbs
        : typeof body.weightLbs === "string"
          ? Number(body.weightLbs)
          : undefined,
    weightOz:
      typeof body.weightOz === "number"
        ? body.weightOz
        : typeof body.weightOz === "string"
          ? Number(body.weightOz)
          : undefined,
    heightIn:
      typeof body.heightIn === "number"
        ? body.heightIn
        : typeof body.heightIn === "string"
          ? Number(body.heightIn)
          : undefined,
    widthIn:
      typeof body.widthIn === "number"
        ? body.widthIn
        : typeof body.widthIn === "string"
          ? Number(body.widthIn)
          : undefined,
    depthIn:
      typeof body.depthIn === "number"
        ? body.depthIn
        : typeof body.depthIn === "string"
          ? Number(body.depthIn)
          : undefined,
    packageType:
      typeof body.packageType === "string" ? body.packageType : undefined,
  };
}

export async function GET(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) {
    authError.headers.set("Cache-Control", "private, no-store");
    return authError;
  }

  try {
    await ensureBtcpostageSchema();
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId")?.trim() ?? "";
    const config = getBtcpostagePublicConfig();

    if (!orderId) {
      return reply({
        ...config,
        // Explicitly never echo secrets.
        hasApiKey: config.configured,
      });
    }

    const label = await getOrderLabelPublic(orderId);
    return reply({ ...config, label });
  } catch {
    return reply({ error: "Unable to load BTCPostage status." }, 500);
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) {
    authError.headers.set("Cache-Control", "private, no-store");
    return authError;
  }
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return reply({ error: "Same-origin request required." }, 403);
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return reply({ error: "Invalid request." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";

  if (!orderId || orderId.length > 150) return reply({ error: "A valid order ID is required." }, 400);

  // This legacy endpoint is recovery-only. All paid purchases must use the
  // server-bound quote and tracking outbox in the combined fulfillment flow.
  if (action === "buy_label") {
    return reply({
      ok: false,
      code: "USE_COMBINED_FULFILLMENT_FLOW",
      error: "Use Verify address & get quote, then Buy label & send tracking in Label & tracking. This action cannot purchase a label.",
    }, 409);
  }
  if (!["verify_address", "get_rates", "retrieve_purchase", "status"].includes(action)) {
    return reply({ error: "Unknown action" }, 400);
  }

  try {
    await ensureBtcpostageSchema();

    if (action === "verify_address") {
      const result = await verifyOrderAddress(orderId);
      return reply({ ok: true, ...result });
    }

    if (action === "get_rates") {
      const result = await getOrderRates(orderId, parsePackage(body));
      return reply({ ok: true, ...result });
    }

    if (action === "retrieve_purchase") {
      const btcpOrderId =
        typeof body.btcpOrderId === "string" ? body.btcpOrderId : null;
      const result = await recoverOrderPurchase({ orderId, btcpOrderId });
      return reply({ ok: true, ...result });
    }

    if (action === "status") {
      const record = await getBtcpostageLabel(orderId);
      return reply({
        ok: true,
        label: record ? toPublicLabel(record) : null,
        ...getBtcpostagePublicConfig(),
      });
    }

    return reply({ error: "Unknown action" }, 400);
  } catch {
    // Provider failures may embed addresses or credentials. Keep the saved
    // purchase evidence in its protected record instead of returning raw errors.
    return reply({ ok: false, error: "BTCPostage action could not be completed. Check saved status before trying again; retrieve any existing purchase instead of buying again.", checkStatusFirst: true }, 409);
  }
}
