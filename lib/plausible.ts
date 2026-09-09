import type { Order } from "@/lib/orders/types";

export const PLAUSIBLE_DOMAIN = "psllabs.org";
const PLAUSIBLE_EVENTS_API = "https://plausible.io/api/event";

export type PlausibleEventProps = Record<string, string | number | boolean>;

export function purchaseProductProp(
  items: Array<{ handle: string }>
): string {
  const handles = items.map((item) => item.handle).filter(Boolean);
  return handles.length > 0 ? handles.join(",") : "unknown";
}

/** Fire a custom event via Plausible's server-side Events API. */
export async function trackPlausibleServerEvent(
  name: string,
  url: string,
  props?: PlausibleEventProps
): Promise<void> {
  try {
    const response = await fetch(PLAUSIBLE_EVENTS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        domain: PLAUSIBLE_DOMAIN,
        url,
        props: props ?? {},
      }),
    });

    if (!response.ok) {
      console.warn(
        `[plausible] server event "${name}" failed with status ${response.status}`
      );
    }
  } catch (error) {
    console.warn(`[plausible] server event "${name}" error:`, error);
  }
}

export async function trackPlausiblePurchase(
  order: Order,
  payment: "bitcoin" | "card",
  url: string
): Promise<void> {
  const props: PlausibleEventProps = {
    amount: order.total,
    product: purchaseProductProp(order.items),
    payment,
  };

  // Non-PII campaign dimensions only (no email, address, click tokens with user IDs beyond platform click ids are ok; skip click ids in Plausible to be safe).
  if (order.attribution?.utmSource) {
    props.source = order.attribution.utmSource;
  }
  if (order.attribution?.utmMedium) {
    props.medium = order.attribution.utmMedium;
  }
  if (order.attribution?.utmCampaign) {
    props.campaign = order.attribution.utmCampaign;
  }
  if (order.attribution?.utmContent) {
    props.content = order.attribution.utmContent;
  }
  if (order.attribution?.landingPage) {
    props.landing = order.attribution.landingPage.slice(0, 100);
  }

  await trackPlausibleServerEvent("purchase", url, props);
}
