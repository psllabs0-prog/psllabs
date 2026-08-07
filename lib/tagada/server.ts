import Tagada from "@tagadapay/node-sdk";

import { SITE_URL } from "@/lib/seo";
import { getTagadaApiKey, getTagadaStoreId } from "@/lib/tagada";

let client: Tagada | null = null;

export function getTagadaServerClient(): Tagada {
  if (!client) {
    client = new Tagada(getTagadaApiKey());
  }
  return client;
}

export type CreatedCheckoutSession = {
  checkoutToken: string;
  sessionToken: string | null;
  redirectUrl: string;
};

/**
 * Create a Tagada checkout session server-side and extract tokens for the
 * headless SDK loadSession() call on the client.
 */
export async function createTagadaCheckoutSession(params: {
  items: Array<{ variantId: string; quantity: number }>;
  email: string;
  firstName: string;
  lastName: string;
  orderId: string;
}): Promise<CreatedCheckoutSession> {
  const tagada = getTagadaServerClient();
  const storeId = getTagadaStoreId();

  const result = await tagada.checkout.createSession({
    storeId,
    items: params.items,
    currency: "USD",
    checkoutUrl: `${SITE_URL}/checkout`,
    returnUrl: `${SITE_URL}/checkout`,
    customerEmail: params.email,
    customerFirstName: params.firstName,
    customerLastName: params.lastName,
    includeCheckoutToken: true,
    // Custom metadata for webhook / fulfillment correlation
    orderId: params.orderId,
    metadata: { orderId: params.orderId },
  });

  const redirectUrl = result.redirectUrl;
  let checkoutToken = result.checkoutToken;
  let sessionToken: string | null = null;

  try {
    const url = new URL(redirectUrl);
    checkoutToken =
      checkoutToken ??
      url.searchParams.get("checkoutToken") ??
      url.searchParams.get("checkout_token");
    sessionToken =
      url.searchParams.get("sessionToken") ??
      url.searchParams.get("token") ??
      null;
  } catch {
    // keep redirectUrl as opaque string
  }

  if (!checkoutToken) {
    throw new Error("Tagada session response did not include a checkout token.");
  }

  return {
    checkoutToken,
    sessionToken,
    redirectUrl,
  };
}
