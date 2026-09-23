import { NextResponse } from "next/server";

import { requireAdminAuth } from "@/lib/admin/require-auth";
import { getBtcpostagePublicConfig } from "@/lib/btcpostage/config";
import { ensureBtcpostageSchema } from "@/lib/btcpostage/schema";
import {
  buyOrderLabel,
  getOrderLabelPublic,
  getOrderRates,
  recoverOrderPurchase,
  verifyOrderAddress,
} from "@/lib/btcpostage/service";
import { getBtcpostageLabel, toPublicLabel } from "@/lib/btcpostage/store";
import type { BtcpostagePackage } from "@/lib/btcpostage/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  if (authError) return authError;

  try {
    await ensureBtcpostageSchema();
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId")?.trim() ?? "";
    const config = getBtcpostagePublicConfig();

    if (!orderId) {
      return NextResponse.json({
        ...config,
        // Explicitly never echo secrets.
        hasApiKey: config.configured,
      });
    }

    const label = await getOrderLabelPublic(orderId);
    return NextResponse.json({ ...config, label });
  } catch (error) {
    console.error("[admin/btcpostage] GET", error);
    return NextResponse.json(
      { error: "Unable to load BTCPostage status." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const authError = await requireAdminAuth();
  if (authError) return authError;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = typeof body.action === "string" ? body.action : "";
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";

  try {
    await ensureBtcpostageSchema();

    if (!orderId) {
      return NextResponse.json({ error: "orderId required" }, { status: 400 });
    }

    if (action === "verify_address") {
      const result = await verifyOrderAddress(orderId);
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "get_rates") {
      const result = await getOrderRates(orderId, parsePackage(body));
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "buy_label") {
      const carrier = typeof body.carrier === "string" ? body.carrier : "";
      const service = typeof body.service === "string" ? body.service : "";
      const confirmPurchase = body.confirmPurchase === true;
      const result = await buyOrderLabel({
        orderId,
        carrier,
        service,
        confirmPurchase,
        pkg: parsePackage(body),
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "retrieve_purchase") {
      const btcpOrderId =
        typeof body.btcpOrderId === "string" ? body.btcpOrderId : null;
      const result = await recoverOrderPurchase({ orderId, btcpOrderId });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "status") {
      const record = await getBtcpostageLabel(orderId);
      return NextResponse.json({
        ok: true,
        label: record ? toPublicLabel(record) : null,
        ...getBtcpostagePublicConfig(),
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin/btcpostage] POST", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "BTCPostage action failed",
      },
      { status: 400 }
    );
  }
}
