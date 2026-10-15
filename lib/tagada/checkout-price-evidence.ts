/**
 * Tagada's v2 summary distinguishes the original totalAmount from the payable
 * totalAdjustedAmount. Headless SDK 1.8 currently normalizes the original total.
 * Read the same authenticated session endpoint and validate its actual summary;
 * never infer a charge amount by subtracting from an SDK-normalized total.
 */
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
const money = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 1024;

export type CheckoutShippingAddress = {
  line1: string; line2?: string; city: string; state: string; postalCode: string; country: string;
};

/** Project provider address aliases without retaining unrelated customer data. */
export function normalizeTagadaCheckoutShippingAddress(value: unknown): CheckoutShippingAddress | null {
  const raw = object(value);
  if (!raw) return null;
  const address = { line1: raw.line1 ?? raw.address1, line2: raw.line2 ?? raw.address2 ?? "", city: raw.city,
    state: raw.state, postalCode: raw.postalCode ?? raw.postal, country: raw.country };
  if (!Object.values(address).every(value => typeof value === "string" && value.length <= 500 && !/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(value)) ||
      ![address.line1, address.city, address.state, address.postalCode, address.country].every(value => (value as string).trim())) return null;
  return address as CheckoutShippingAddress;
}

/** Case/spacing and line splits may differ; no street or ZIP+4 is guessed. */
export function tagadaCheckoutShippingAddressMatches(expected: CheckoutShippingAddress, value: unknown): boolean {
  const actual = normalizeTagadaCheckoutShippingAddress(value);
  const wanted = normalizeTagadaCheckoutShippingAddress(expected);
  if (!actual || !wanted) return false;
  const clean = (text: string) => text.trim().replace(/\s+/g, " ").toUpperCase();
  const street = (address: CheckoutShippingAddress) => clean([address.line1, address.line2 ?? ""].join(" "));
  const postal = (text: string) => clean(text).replace(/-/g, "");
  return street(actual) === street(wanted) && clean(actual.city) === clean(wanted.city) &&
    clean(actual.state) === clean(wanted.state) && clean(actual.country) === clean(wanted.country) &&
    /^\d{5}(?:\d{4})?$/.test(postal(actual.postalCode)) && postal(actual.postalCode) === postal(wanted.postalCode);
}

export type CheckoutPriceBinding = {
  storeId: string;
  checkoutToken: string;
  expectedSessionId?: string;
  expectedShippingRateId?: string;
  /** Only for explicitly marked unpaid provider QA drafts. Never set in checkout. */
  allowSyntheticDraft?: boolean;
};

export function normalizeTagadaCheckoutPriceEvidence(value: unknown, binding: CheckoutPriceBinding) {
  const raw = object(value);
  const session = object(raw?.checkoutSession);
  // The raw v2 endpoint calls this shippingRateId; the SDK normalizes it to
  // selectedShippingRateId. Read the provider field, not a browser assertion.
  const selectedShippingRateId = session?.shippingRateId;
  const summaries = Array.isArray(session?.orderSummaries) ? session.orderSummaries : [];
  const summary = object(raw?.summary ?? session?.summary ?? summaries[0]);
  const metadata = object(session?.metadata);
  if (!session || !summary || !identifier(session.id) || session.storeId !== binding.storeId ||
      session.checkoutToken !== binding.checkoutToken ||
      (binding.expectedSessionId && session.id !== binding.expectedSessionId) ||
      (binding.expectedShippingRateId && selectedShippingRateId !== binding.expectedShippingRateId) ||
      summary.currency !== "USD" || (session.selectedPresentmentCurrency != null && session.selectedPresentmentCurrency !== "USD")) return null;
  if (binding.allowSyntheticDraft ? !(session.draft === true && metadata?.synthetic === true)
    : session.draft === true || metadata?.synthetic === true) return null;
  const subtotal = summary.subtotalAmount;
  const discount = summary.totalPromotionAmount;
  const shipping = summary.shippingCost;
  const tax = summary.totalTaxAmount;
  if (![subtotal, discount, shipping, tax].every(money)) return null;
  const amounts = { subtotal: subtotal as number, discount: discount as number, shipping: shipping as number, tax: tax as number };
  if (amounts.discount > amounts.subtotal) return null;
  const gross = amounts.subtotal + amounts.shipping + amounts.tax;
  const total = summary.totalAdjustedAmount ?? (amounts.discount === 0 ? summary.totalAmount : undefined);
  if (!money(total) || total !== gross - amounts.discount || !money(summary.totalAmount) ||
      (summary.totalAmount !== gross && summary.totalAmount !== total)) return null;
  if (!Array.isArray(summary.items) || summary.items.length < 1 || summary.items.length > 50 ||
      !Array.isArray(session.sessionLineItems) || session.sessionLineItems.length !== summary.items.length) return null;
  const seen = new Set<string>();
  const items: Array<{ variantId: string; quantity: number }> = [];
  let itemSubtotal = 0;
  for (const value of summary.items) {
    const item = object(value);
    if (!item || !identifier(item.variantId) || seen.has(item.variantId) || item.currency !== "USD" ||
        typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100 ||
        !money(item.unitAmount) || !money(item.amount) || item.amount !== item.unitAmount * item.quantity ||
        session.sessionLineItems.filter(value => {
          const line = object(value);
          return line?.variantId === item.variantId && line?.quantity === item.quantity;
        }).length !== 1) return null;
    seen.add(item.variantId);
    itemSubtotal += item.amount;
    items.push({ variantId: item.variantId, quantity: item.quantity });
  }
  if (itemSubtotal !== amounts.subtotal) return null;
  const customer = object(session.customer);
  return {
    id: session.id,
    storeId: binding.storeId,
    checkoutToken: binding.checkoutToken,
    currency: "USD",
    ...(identifier(selectedShippingRateId) ? { selectedShippingRateId } : {}),
    items,
    totals: { ...amounts, total, currency: "USD" },
    customer: customer && typeof customer.email === "string" ? { email: customer.email } : undefined,
    shippingAddress: normalizeTagadaCheckoutShippingAddress(session.shippingAddress) ?? undefined,
  };
}

export async function readTagadaCheckoutPriceEvidence(
  binding: CheckoutPriceBinding,
  sessionToken: string | null,
  environment: "production" | "development" = "production",
) {
  if (!identifier(binding.storeId) || !identifier(binding.checkoutToken) || !sessionToken || sessionToken.length > 8192) {
    throw new Error("The authenticated card checkout binding is unavailable.");
  }
  const { HttpClient } = await import("@tagadapay/headless-sdk");
  const http = new HttpClient({ baseUrl: HttpClient.resolveBaseUrl(environment), timeout: 30000,
    getToken: () => sessionToken });
  const raw = await http.get(`/api/v1/checkout-sessions/${encodeURIComponent(binding.checkoutToken)}/v2`, {
    params: { skipAsyncWait: "false" }, token: sessionToken,
  });
  const evidence = normalizeTagadaCheckoutPriceEvidence(raw, binding);
  if (!evidence) throw new Error("The provider's payable card total or session binding could not be verified.");
  return evidence;
}
