/** Pure event preparation. No SDK, credentials or network activity lives here. */
export const PSL_TIKTOK_PIXEL_ID = "DB53OTJC77U074LG2FOG";
export const TIKTOK_EVENT_NAMES = ["Pageview", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"] as const;
export type TikTokEventName = typeof TIKTOK_EVENT_NAMES[number];
export type TikTokEventPolicy = {
  approvedPaths: Readonly<Partial<Record<TikTokEventName, readonly string[]>>>;
  approvedProductIds: readonly string[];
};
export const REVIEWED_TIKTOK_PRODUCTS = Object.freeze([
  { sku: "PSL-RT-10MG", path: "/products/psl-rt-10mg", handle: "retatrutide" },
  { sku: "PSL-GHKCU-50MG", path: "/products/psl-ghkcu-50mg", handle: "ghk-cu" },
  { sku: "PSL-BPC157-10MG", path: "/products/psl-bpc157-10mg", handle: "bpc-157" },
  { sku: "PSL-TESA-10MG", path: "/products/psl-tesa-10mg", handle: "tesamorelin" },
  { sku: "PSL-RS-5ML", path: "/products/psl-rs-5ml", handle: "reconstitution-solution" },
]);
/** Context candidates, not proof of platform data-use eligibility or activation. */
export const REVIEWED_TIKTOK_EVENT_POLICY: TikTokEventPolicy = {
  approvedPaths: {
    Pageview: ["/", "/products", "/about", "/faq", "/testing", ...REVIEWED_TIKTOK_PRODUCTS.map((p) => p.path)],
    ViewContent: REVIEWED_TIKTOK_PRODUCTS.map((p) => p.path),
    AddToCart: REVIEWED_TIKTOK_PRODUCTS.map((p) => p.path),
    InitiateCheckout: ["/checkout"], Purchase: ["/success"],
  }, approvedProductIds: REVIEWED_TIKTOK_PRODUCTS.map((p) => p.sku),
};
export const PRODUCTION_TIKTOK_EVENT_POLICY: TikTokEventPolicy = Object.freeze({
  approvedPaths: Object.freeze({}), approvedProductIds: Object.freeze([]),
});
export function tikTokSourceUrlAllowed(sourceUrl: string, name: TikTokEventName, policy: TikTokEventPolicy): boolean {
  try {
    const url = new URL(sourceUrl);
    if (!["https://www.psllabs.org", "https://psllabs.org"].includes(url.origin) || url.hash || url.username || url.password ||
        /%/.test(url.pathname) || /^\/(admin|api|account|auth|track|test|demo)/i.test(url.pathname) ||
        (url.pathname.startsWith("/success") && (name !== "Purchase" || url.pathname !== "/success")) ||
        !policy.approvedPaths[name]?.includes(url.pathname)) return false;
    // Preserve the genuine URL. Do not rename product paths or forward arbitrary queries.
    return [...url.searchParams.entries()].every(([key, value]) => key === "ttclid" && /^[A-Za-z0-9_-]{1,512}$/.test(value)) &&
      url.searchParams.getAll("ttclid").length <= 1;
  } catch { return false; }
}
export type TikTokEventInput = {
  name: TikTokEventName; eventId: string; occurredAt: number; sourceUrl: string;
  productIds?: readonly string[]; valueCents?: number; currency?: string;
  settledPayment?: boolean; admin?: boolean; synthetic?: boolean; testPurchase?: boolean;
};
export type PreparedTikTokEvent = {
  event: TikTokEventName; event_id: string; event_time: number; page: { url: string };
  properties?: { content_ids: string[]; content_type: "product"; value?: number; currency?: "USD" };
};
export function prepareTikTokEvent(input: TikTokEventInput, options: {
  policy?: TikTokEventPolicy; now?: number; currentConsent: boolean;
}): { ok: true; event: PreparedTikTokEvent } | { ok: false; reason: string } {
  if (!options.currentConsent) return { ok: false, reason: "consent_required" };
  if (input.admin || input.synthetic || input.testPurchase) return { ok: false, reason: "excluded_activity" };
  const policy = options.policy ?? PRODUCTION_TIKTOK_EVENT_POLICY;
  if (!TIKTOK_EVENT_NAMES.includes(input.name) || !tikTokSourceUrlAllowed(input.sourceUrl, input.name, policy)) {
    return { ok: false, reason: "unapproved_context" };
  }
  if (!/^[a-f0-9-]{32,64}$/.test(input.eventId)) return { ok: false, reason: "invalid_event_id" };
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(input.occurredAt) || input.occurredAt > now || now - input.occurredAt > 86_400_000) {
    return { ok: false, reason: "invalid_event_time" };
  }
  const productIds = [...(input.productIds ?? [])];
  if (productIds.length > 10 || new Set(productIds).size !== productIds.length ||
      productIds.some((id) => !policy.approvedProductIds.includes(id)) ||
      (input.name !== "Pageview" && !productIds.length)) return { ok: false, reason: "unapproved_product" };
  const product = REVIEWED_TIKTOK_PRODUCTS.find((p) => p.path === new URL(input.sourceUrl).pathname);
  if ((input.name === "ViewContent" || input.name === "AddToCart") && product &&
      (productIds.length !== 1 || productIds[0] !== product.sku)) return { ok: false, reason: "product_context_mismatch" };
  if (input.name === "Pageview" && (productIds.length || input.valueCents !== undefined || input.currency !== undefined)) {
    return { ok: false, reason: "unexpected_product_data" };
  }
  if (input.name === "Purchase" && !input.settledPayment) return { ok: false, reason: "unverified_payment" };
  if (input.name === "Purchase" || input.valueCents !== undefined || input.currency !== undefined) {
    if (!Number.isSafeInteger(input.valueCents) || input.valueCents! <= 0 || input.currency !== "USD") {
      return { ok: false, reason: "invalid_money" };
    }
  }
  return { ok: true, event: {
    event: input.name, event_id: input.eventId, event_time: Math.floor(input.occurredAt / 1000), page: { url: input.sourceUrl },
    ...(productIds.length ? { properties: { content_ids: productIds, content_type: "product" as const,
      ...(input.valueCents !== undefined ? { value: input.valueCents / 100, currency: "USD" as const } : {}) } } : {}),
  } };
}
/** Both channels retain exactly this event name and ID, including Pageview's spelling. */
export function tikTokBrowserEventArguments(event: PreparedTikTokEvent) {
  return [event.event, event.properties ?? {}, { event_id: event.event_id }] as const;
}
