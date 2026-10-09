/** Event preparation only. This module has no network transport or browser SDK. */
export const PSL_META_DATASET_ID = "1407501624889556";
export const META_EVENT_NAMES = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"] as const;
export type MetaEventName = typeof META_EVENT_NAMES[number];
export type MetaEventPolicy = {
  approvedPaths: Readonly<Partial<Record<MetaEventName, readonly string[]>>>;
  approvedProductIds: readonly string[];
};
export const REVIEWED_META_PRODUCTS = Object.freeze([
  { sku: "PSL-RT-10MG", path: "/products/psl-rt-10mg", handle: "retatrutide" },
  { sku: "PSL-GHKCU-50MG", path: "/products/psl-ghkcu-50mg", handle: "ghk-cu" },
  { sku: "PSL-BPC157-10MG", path: "/products/psl-bpc157-10mg", handle: "bpc-157" },
  { sku: "PSL-TESA-10MG", path: "/products/psl-tesa-10mg", handle: "tesamorelin" },
  { sku: "PSL-RS-5ML", path: "/products/psl-rs-5ml", handle: "reconstitution-solution" },
]);
/** Context review under the confirmed laboratory-only business purpose, not activation approval. */
export const REVIEWED_META_EVENT_POLICY: MetaEventPolicy = {
  approvedPaths: {
    PageView: ["/", "/products", "/about", "/faq", "/testing", ...REVIEWED_META_PRODUCTS.map((p) => p.path)],
    ViewContent: REVIEWED_META_PRODUCTS.map((p) => p.path),
    AddToCart: REVIEWED_META_PRODUCTS.map((p) => p.path),
    InitiateCheckout: ["/checkout"], Purchase: ["/success"],
  }, approvedProductIds: REVIEWED_META_PRODUCTS.map((p) => p.sku),
};
export function metaSourceUrlAllowed(sourceUrl: string, name: MetaEventName, policy: MetaEventPolicy): boolean {
  try {
    const url = new URL(sourceUrl);
    if (!["https://www.psllabs.org", "https://psllabs.org"].includes(url.origin) || url.hash || url.username || url.password ||
        /%/i.test(url.pathname) || /^\/(admin|api|account|auth|track|test|demo)/i.test(url.pathname) ||
        (url.pathname.startsWith("/success") && (name !== "Purchase" || url.pathname !== "/success")) ||
        !policy.approvedPaths[name]?.includes(url.pathname)) return false;
    // Permit the genuine ad-click identifier after consent, while rejecting arbitrary
    // query strings. Preserve the actual URL; do not replace it with a generic page.
    return [...url.searchParams.entries()].every(([key, value]) => key === "fbclid" && /^[A-Za-z0-9_-]{1,512}$/.test(value)) &&
      url.searchParams.getAll("fbclid").length <= 1;
  } catch { return false; }
}
/** Advertising approval is not evidence that a particular product event is permitted. */
export const PRODUCTION_META_EVENT_POLICY: MetaEventPolicy = Object.freeze({
  approvedPaths: Object.freeze({}), approvedProductIds: Object.freeze([]),
});
export type MetaEventInput = {
  name: MetaEventName; eventId: string; occurredAt: number; sourceUrl: string;
  productIds?: readonly string[]; valueCents?: number; currency?: string;
  settledPayment?: boolean; admin?: boolean; synthetic?: boolean; testPurchase?: boolean;
};
export type PreparedMetaEvent = {
  event_name: MetaEventName; event_id: string; event_time: number;
  action_source: "website"; event_source_url: string;
  custom_data?: { content_ids: string[]; content_type: "product"; value?: number; currency?: "USD" };
};
export function prepareMetaEvent(input: MetaEventInput, options: {
  policy?: MetaEventPolicy; now?: number; currentConsent: boolean;
}): { ok: true; event: PreparedMetaEvent } | { ok: false; reason: string } {
  if (!options.currentConsent) return { ok: false, reason: "consent_required" };
  if (input.admin || input.synthetic || input.testPurchase) return { ok: false, reason: "excluded_activity" };
  const policy = options.policy ?? PRODUCTION_META_EVENT_POLICY;
  let url: URL;
  try { url = new URL(input.sourceUrl); } catch { return { ok: false, reason: "invalid_source" }; }
  if (!metaSourceUrlAllowed(input.sourceUrl, input.name, policy)) {
    // Reject the actual context rather than substitute a generic URL or event name.
    return { ok: false, reason: "unapproved_context" };
  }
  if (!/^[a-f0-9-]{32,64}$/.test(input.eventId)) return { ok: false, reason: "invalid_event_id" };
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(input.occurredAt) || input.occurredAt > now || now - input.occurredAt > 86_400_000) {
    return { ok: false, reason: "invalid_event_time" };
  }
  const productIds = [...(input.productIds ?? [])];
  if (input.name !== "PageView" && (!productIds.length ||
      productIds.some((id) => !policy.approvedProductIds.includes(id)))) {
    return { ok: false, reason: "unapproved_product" };
  }
  const contextProduct = REVIEWED_META_PRODUCTS.find((product) => product.path === url.pathname);
  if ((input.name === "ViewContent" || input.name === "AddToCart") && contextProduct &&
      (productIds.length !== 1 || productIds[0] !== contextProduct.sku)) return { ok: false, reason: "product_context_mismatch" };
  if (input.name === "PageView" && productIds.length) return { ok: false, reason: "unexpected_product_data" };
  if (input.name === "Purchase" && !input.settledPayment) return { ok: false, reason: "unverified_payment" };
  if (input.name === "Purchase" || input.valueCents !== undefined || input.currency !== undefined) {
    if (!Number.isSafeInteger(input.valueCents) || input.valueCents! <= 0 || input.currency !== "USD") {
      return { ok: false, reason: "invalid_money" };
    }
  }
  const event: PreparedMetaEvent = {
    event_name: input.name, event_id: input.eventId, event_time: Math.floor(input.occurredAt / 1000),
    action_source: "website", event_source_url: input.sourceUrl,
    ...(productIds.length ? { custom_data: { content_ids: productIds, content_type: "product" as const,
      ...(input.valueCents !== undefined ? { value: input.valueCents / 100, currency: "USD" as const } : {}) } } : {}),
  };
  return { ok: true, event };
}
/** Both channels consume the same prepared event, preserving name and ID exactly. */
export function browserEventArguments(event: PreparedMetaEvent) {
  return ["trackSingle", PSL_META_DATASET_ID, event.event_name, event.custom_data ?? {}, { eventID: event.event_id }] as const;
}
