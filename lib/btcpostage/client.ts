import {
  getBtcpostageApiBase,
  getBtcpostageCredentials,
  getBtcpostageFromAddress,
} from "./config";
import { getManualFulfillmentTestScope } from "@/lib/db/sql";
import { MANUAL_TEST_ORDER } from "@/lib/fulfillment/manual-test-constants";
import { verificationErrorDiagnostics } from "./verification-diagnostics";
import type {
  BtcpostageAddress,
  BtcpostagePackage,
  BtcpostagePurchase,
  BtcpostagePurchaseItem,
  BtcpostageRate,
} from "./types";

export class BtcpostageApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly uncertain: boolean;

  constructor(
    message: string,
    opts: { status?: number; body?: string; uncertain?: boolean } = {}
  ) {
    super(message);
    this.name = "BtcpostageApiError";
    this.status = opts.status ?? 0;
    this.body = opts.body ?? "";
    this.uncertain = opts.uncertain ?? false;
  }
}

type FetchLike = typeof fetch;

function formBody(fields: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  return params.toString();
}

async function postForm(
  endpoint: string,
  fields: Record<string, string | number | boolean | undefined | null>,
  fetchImpl: FetchLike = fetch
): Promise<{ status: number; text: string; json: unknown }> {
  const { key, secret } = getBtcpostageCredentials();
  const url = `${getBtcpostageApiBase()}/${endpoint.replace(/^\//, "")}`;
  let response: Response;
  const manualTest = getManualFulfillmentTestScope();
  if (manualTest && !["verify-address", "get-rates", "create-purchase", "retrieve-purchase"].includes(endpoint)) {
    throw new Error("Manual tests cannot contact this carrier endpoint.");
  }
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({ ...fields, key, secret }),
      ...(manualTest ? { redirect: "error" as const, signal: AbortSignal.timeout(30_000) } : {}),
    });
  } catch (error) {
    throw new BtcpostageApiError(
      error instanceof Error ? error.message : "BTCPostage network error",
      { uncertain: true }
    );
  }

  let text: string;
  try { text = await response.text(); }
  catch { throw new BtcpostageApiError("BTCPostage response was interrupted; verify the purchase before retrying.", { uncertain: true }); }
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new BtcpostageApiError(
      `BTCPostage HTTP ${response.status}: ${text.slice(0, 240)}`,
      { status: response.status, body: text, uncertain: response.status >= 500 || response.status === 408 }
    );
  }

  if (typeof text === "string") {
    if (text.includes("Could not verify API key")) {
      throw new BtcpostageApiError("Invalid BTCPostage API credentials.", {
        status: response.status,
        body: text,
      });
    }
    if (text.includes("No valid price quotes found")) {
      throw new BtcpostageApiError(
        "No BTCPostage rates found for this package/address.",
        { status: response.status, body: text }
      );
    }
    if (/insufficient credits/i.test(text)) {
      throw new BtcpostageApiError(text.trim(), {
        status: response.status,
        body: text,
      });
    }
  }

  return { status: response.status, text, json };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function parseRate(row: unknown): BtcpostageRate | null {
  const r = asRecord(row);
  if (!r) return null;
  const service = str(r.service);
  if (!service) return null;
  return {
    service,
    serviceDisplay: str(r.service_display, service),
    rate: str(r.rate),
    carrier: str(r.carrier),
    estDeliveryDays:
      r.est_delivery_days === null || r.est_delivery_days === undefined
        ? null
        : (r.est_delivery_days as string | number),
    currency: str(r.currency, "USD"),
  };
}

function parsePurchaseItem(row: unknown): BtcpostagePurchaseItem | null {
  const r = asRecord(row);
  if (!r) return null;
  return {
    shipmentId: str(r.shipment_id),
    carrier: str(r.carrier),
    service: str(r.service),
    price: str(r.price),
    currency: str(r.currency, "USD"),
    filename: str(r.filename),
    trackingNo: str(r.tracking_no),
    fromName: str(r.from_name) || undefined,
    toName: str(r.to_name) || undefined,
  };
}

function parsePurchase(json: unknown): BtcpostagePurchase {
  const r = asRecord(json);
  if (!r) {
    throw new BtcpostageApiError("Unexpected BTCPostage purchase response.", {
      uncertain: true,
      body: typeof json === "string" ? json : JSON.stringify(json ?? ""),
    });
  }
  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items = itemsRaw
    .map(parsePurchaseItem)
    .filter((x): x is BtcpostagePurchaseItem => Boolean(x));
  const orderId = str(r.order_id);
  if (!orderId) {
    throw new BtcpostageApiError("BTCPostage purchase missing order_id.", {
      uncertain: true,
      body: JSON.stringify(r),
    });
  }
  return {
    orderId,
    orderTimestamp: str(r.order_timestamp) || null,
    remainingCredits:
      r.remaining_credits === null || r.remaining_credits === undefined
        ? null
        : Number(r.remaining_credits),
    orderNotes: str(r.order_notes) || null,
    items,
  };
}

export type VerifyAddressResult = {
  isValid: boolean;
  standardized: BtcpostageAddress | null;
  errors: string[];
  raw: unknown;
};

export async function verifyAddress(
  address: BtcpostageAddress,
  fetchImpl?: FetchLike
): Promise<VerifyAddressResult> {
  const { json } = await postForm(
    "verify-address",
    {
      // The live verifier reports street1 required when only its documented fields
      // are submitted. Include the shared shipping-form aliases with identical data.
      name: address.name ?? "",
      to_name: address.name ?? "",
      street1: address.street1,
      street: address.street1,
      to_street: address.street1,
      street2: address.street2 ?? "",
      to_street2: address.street2 ?? "",
      city: address.city,
      to_city: address.city,
      state: address.state,
      to_state: address.state,
      zip: address.zip,
      to_zip: address.zip,
      country: address.country,
      to_country: address.country,
      phone: address.phone ?? "",
      to_phone: address.phone ?? "",
    },
    fetchImpl
  );

  const root = asRecord(json);
  const data = asRecord(root?.data);
  const addr = asRecord(data?.address);
  const verification = asRecord(data?.verification);
  const errorsRaw = verification?.errors;
  const errors = Array.isArray(errorsRaw)
    ? errorsRaw.map((e) => str(e)).filter(Boolean)
    : [];
  // An HTTP/API success is not proof that a delivery address is valid.
  // Explicit negative verification must win over a generic success envelope.
  const isValid = root?.is_valid !== false && verification?.is_valid !== false &&
    (root?.is_valid === true || verification?.is_valid === true);

  const standardized: BtcpostageAddress | null = addr
    ? {
        street1: str(addr.street1, address.street1),
        street2: str(addr.street2, address.street2 ?? ""),
        city: str(addr.city, address.city),
        state: str(addr.state, address.state),
        zip: str(addr.zip, address.zip),
        country: str(addr.country, address.country),
        phone: str(addr.phone, address.phone ?? ""),
        company: addr.company == null ? null : str(addr.company),
        residential:
          typeof addr.residential === "boolean" ? addr.residential : undefined,
        name: address.name,
      }
    : null;

  if (getManualFulfillmentTestScope() && (!isValid || !standardized || errors.length)) {
    // Diagnose the private fixture without logging addresses, provider bodies or free-text errors.
    let senderHasStreet2: boolean | null = null;
    try { senderHasStreet2 = Boolean(getBtcpostageFromAddress().street2?.trim()); } catch { /* Boolean readiness only. */ }
    console.warn("[manual-fulfillment-test]", { event: "address_verification_blocked",
      responseStatus: root?.status === "success" ? "success" : root?.status === "error" ? "error" : "other",
      rootValidity: typeof root?.is_valid === "boolean" ? root.is_valid : "missing",
      verificationValidity: typeof verification?.is_valid === "boolean" ? verification.is_valid : "missing",
      standardizedAddressPresent: Boolean(addr), inputSuitePresent: Boolean(address.street2?.trim()), senderHasStreet2,
      providerErrorCount: Array.isArray(errorsRaw) ? errorsRaw.length : 0,
      providerErrors: verificationErrorDiagnostics(errorsRaw, address, getBtcpostageCredentials()).map(error => JSON.stringify(error)) });
  }
  return { isValid: Boolean(isValid) && errors.length === 0, standardized, errors, raw: json };
}

export async function getRates(input: {
  to: BtcpostageAddress;
  from: BtcpostageAddress;
  pkg: BtcpostagePackage;
  carrier?: string;
  toCommercialAddress?: boolean;
  fetchImpl?: FetchLike;
}): Promise<BtcpostageRate[]> {
  const { json, text } = await postForm(
    "get-rates",
    {
      to_name: input.to.name ?? "",
      to_street: input.to.street1,
      to_street2: input.to.street2 ?? "",
      to_city: input.to.city,
      to_state: input.to.state,
      to_zip: input.to.zip,
      to_country: input.to.country,
      to_phone: input.to.phone ?? "",
      to_commercial_address: input.toCommercialAddress ? "true" : "false",
      from_name: input.from.name ?? "",
      from_street: input.from.street1,
      from_street2: input.from.street2 ?? "",
      from_city: input.from.city,
      from_state: input.from.state,
      from_zip: input.from.zip,
      from_country: input.from.country,
      from_phone: input.from.phone ?? "",
      package_type: input.pkg.packageType,
      carrier: input.carrier ?? "USPS",
      weight_oz: Math.max(0, Math.round(input.pkg.weightOz)),
      weight_lbs: Math.max(0, Math.floor(input.pkg.weightLbs)),
      height: input.pkg.heightIn,
      width: input.pkg.widthIn,
      depth: input.pkg.depthIn,
    },
    input.fetchImpl
  );

  if (!Array.isArray(json)) {
    throw new BtcpostageApiError(
      `Unexpected rates response: ${text.slice(0, 240)}`,
      { body: text }
    );
  }

  return json
    .map(parseRate)
    .filter((r): r is BtcpostageRate => Boolean(r));
}

export async function createPurchase(input: {
  to: BtcpostageAddress;
  from: BtcpostageAddress;
  pkg: BtcpostagePackage;
  carrier: string;
  service: string;
  labelFormat?: "PDF" | "PNG";
  testMode?: boolean;
  toCommercialAddress?: boolean;
  orderNotes?: string;
  fetchImpl?: FetchLike;
}): Promise<BtcpostagePurchase> {
  if (getManualFulfillmentTestScope() && (input.testMode !== true || input.carrier !== "USPS" || input.orderNotes !== `PSL ${MANUAL_TEST_ORDER}`)) {
    throw new Error("The manual test can create only a no-debit USPS test label for its fixed fake order.");
  }
  const fields: Record<string, string | number | boolean | undefined | null> = {
    to_name: input.to.name ?? "",
    to_street: input.to.street1,
    to_street2: input.to.street2 ?? "",
    to_city: input.to.city,
    to_state: input.to.state,
    to_zip: input.to.zip,
    to_country: input.to.country,
    to_phone: input.to.phone ?? "",
    to_commercial_address: input.toCommercialAddress ? "true" : "false",
    from_name: input.from.name ?? "",
    from_street: input.from.street1,
    from_street2: input.from.street2 ?? "",
    from_city: input.from.city,
    from_state: input.from.state,
    from_zip: input.from.zip,
    from_country: input.from.country,
    from_phone: input.from.phone ?? "",
    package_type: input.pkg.packageType,
    carrier: input.carrier,
    service: input.service,
    weight_oz: Math.max(0, Math.round(input.pkg.weightOz)),
    weight_lbs: Math.max(0, Math.floor(input.pkg.weightLbs)),
    height: input.pkg.heightIn,
    width: input.pkg.widthIn,
    depth: input.pkg.depthIn,
    label_format: input.labelFormat ?? "PDF",
    order_notes: input.orderNotes ?? "",
  };

  // Docs: only include test_mode when true; only supported for USPS.
  if (input.testMode) {
    fields.test_mode = true;
  }

  const { json } = await postForm("create-purchase", fields, input.fetchImpl);
  return parsePurchase(json);
}

export async function retrievePurchase(
  btcpOrderId: string,
  fetchImpl?: FetchLike
): Promise<BtcpostagePurchase> {
  const { json } = await postForm(
    "retrieve-purchase",
    { order_id: btcpOrderId },
    fetchImpl
  );
  return parsePurchase(json);
}

/** Build request field map for tests — never includes live secrets in assertions. */
export function buildCreatePurchaseFieldsForTest(input: {
  carrier: string;
  service: string;
  testMode: boolean;
}): Record<string, string | boolean> {
  const fields: Record<string, string | boolean> = {
    carrier: input.carrier,
    service: input.service,
  };
  if (input.testMode) fields.test_mode = true;
  return fields;
}
