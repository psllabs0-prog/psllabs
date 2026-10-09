import { readPrivacyConsent } from "../privacy/client";
import {
  browserEventArguments, metaSourceUrlAllowed, PSL_META_DATASET_ID,
  REVIEWED_META_EVENT_POLICY, REVIEWED_META_PRODUCTS, type MetaEventName, type PreparedMetaEvent,
} from "./events";

export type MetaBrowserEventName = Exclude<MetaEventName, "Purchase">;
export type MetaBrowserAction = {
  name: MetaBrowserEventName; eventId: string; sourceUrl: string;
  productIds?: string[]; consentRevision: number; createdAt: number;
};
type Pixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void; queue: unknown[][];
  push?: Pixel; loaded?: boolean; version?: string;
};
type PixelWindow = Window & { fbq?: Pixel; _fbq?: Pixel };
let sdkOwned = false;
let ownedPixel: Pixel | null = null;
let sdkStopped = false;
let sdkGranted = false;
let sdkReady: Promise<boolean> | null = null;
const attempted = new Set<string>();
const eventNames: MetaBrowserEventName[] = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout"];

export function metaBrowserContextAllowed(sourceUrl: string, referrer: string): boolean {
  if (!eventNames.some((name) => metaSourceUrlAllowed(sourceUrl, name, REVIEWED_META_EVENT_POLICY))) return false;
  if (!referrer) return true;
  try {
    const url = new URL(referrer);
    if (["https://www.psllabs.org", "https://psllabs.org"].includes(url.origin)) {
      return eventNames.some((name) => metaSourceUrlAllowed(referrer, name, REVIEWED_META_EVENT_POLICY));
    }
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/" && ["facebook.com", "www.facebook.com", "m.facebook.com", "l.facebook.com",
        "instagram.com", "www.instagram.com", "l.instagram.com"].includes(url.hostname);
  } catch { return false; }
}

export function metaBrowserPermission(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const consent = readPrivacyConsent();
  return consent.choice === "saved" && consent.measurement && consent.personalization &&
    consent.capabilities.metaMeasurement && consent.capabilities.metaPersonalization &&
    !consent.gpc && !consent.admin && !sdkStopped &&
    metaBrowserContextAllowed(window.location.href, document.referrer);
}

export const hasMetaBrowserSdk = () => sdkOwned;
export function stopMetaBrowserDispatch(): void {
  if (sdkStopped) return;
  // Notify only the SDK instance we initialized, while its wrapper still forwards
  // commands. Clearing globals alone cannot revoke the SDK's internal consent.
  if (ownedPixel?.callMethod) {
    try { ownedPixel("consent", "revoke"); } catch { /* Still disable local dispatch and replace the document. */ }
  }
  sdkStopped = true;
  sdkGranted = false;
  if (typeof window === "undefined" || !sdkOwned) return;
  const target = window as PixelWindow;
  if (ownedPixel) ownedPixel.queue.length = 0;
  const stopped = Object.assign(() => {}, { queue: [] as unknown[][] });
  if (target.fbq === ownedPixel) target.fbq = stopped;
  if (target._fbq === ownedPixel) target._fbq = stopped;
}

export function createMetaBrowserAction(name: MetaBrowserEventName, productIds?: readonly string[]): MetaBrowserAction | null {
  if (!metaBrowserPermission() || !metaSourceUrlAllowed(window.location.href, name, REVIEWED_META_EVENT_POLICY)) return null;
  if (!eventNames.includes(name) || !window.crypto?.randomUUID) return null;
  const ids = productIds ?? [];
  if ((name === "PageView" && ids.length) || (name !== "PageView" && (!ids.length || ids.length > 10 ||
      ids.some((id) => !REVIEWED_META_EVENT_POLICY.approvedProductIds.includes(id))))) return null;
  const product = REVIEWED_META_PRODUCTS.find((entry) => entry.path === window.location.pathname);
  if ((name === "ViewContent" || name === "AddToCart") &&
      (!product || ids.length !== 1 || ids[0] !== product.sku)) return null;
  return { name, eventId: window.crypto.randomUUID(), sourceUrl: window.location.href,
    ...(productIds?.length ? { productIds: [...productIds] } : {}),
    consentRevision: readPrivacyConsent().revision, createdAt: Date.now() };
}

function currentAction(action: MetaBrowserAction): boolean {
  return metaBrowserPermission() && readPrivacyConsent().revision === action.consentRevision &&
    window.location.href === action.sourceUrl && Date.now() - action.createdAt < 60_000;
}

function checkedReply(value: unknown, action: MetaBrowserAction): PreparedMetaEvent | null {
  const event = (value as { event?: PreparedMetaEvent } | null)?.event;
  if (!event || Object.keys(event).some((key) => !["event_name", "event_id", "event_time", "action_source", "event_source_url", "custom_data"].includes(key)) ||
      event.event_name !== action.name || event.event_id !== action.eventId || event.event_source_url !== action.sourceUrl ||
      event.action_source !== "website" || !Number.isSafeInteger(event.event_time) ||
      Math.abs(Date.now() / 1000 - event.event_time) > 300) return null;
  const ids = action.productIds ?? [];
  if (!ids.length) return event.custom_data ? null : event;
  const data = event.custom_data;
  if (!data || Object.keys(data).some((key) => !["content_ids", "content_type"].includes(key)) ||
      data.content_type !== "product" || !Array.isArray(data.content_ids) ||
      JSON.stringify(data.content_ids) !== JSON.stringify(ids)) return null;
  return event;
}

function loadSdk(): Promise<boolean> {
  if (sdkReady) return sdkReady;
  if (!metaBrowserPermission() || (window as PixelWindow).fbq) return Promise.resolve(false);
  const target = window as PixelWindow;
  const pixel = Object.assign(function (...args: unknown[]) {
    if (sdkStopped) return;
    if (pixel.callMethod) pixel.callMethod(...args);
    else pixel.queue.push(args);
  }, { queue: [] as unknown[][] }) as Pixel;
  pixel.push = pixel; pixel.loaded = true; pixel.version = "2.0";
  target.fbq = pixel; target._fbq = pixel;
  ownedPixel = pixel;
  sdkOwned = true;
  // This precedes init and the SDK request. Never pass matching fields or issue
  // an automatic PageView; only a server-approved event can be dispatched.
  pixel("consent", "revoke");
  pixel("set", "autoConfig", false, PSL_META_DATASET_ID);
  pixel("init", PSL_META_DATASET_ID);
  sdkReady = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.id = "psl-meta-pixel";
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.onload = () => resolve(metaBrowserPermission());
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return sdkReady;
}

/** One action ID is shared by the first-party/server request and browser Pixel. No replay or retry queue. */
export async function dispatchMetaBrowserAction(action: MetaBrowserAction | null): Promise<boolean> {
  if (!action || !currentAction(action) || attempted.has(action.eventId)) return false;
  attempted.add(action.eventId);
  try {
    const response = await fetch("/api/meta/events", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: action.name, eventId: action.eventId, sourceUrl: action.sourceUrl,
        ...(action.productIds ? { productIds: action.productIds } : {}) }),
    });
    if (!response.ok || !currentAction(action)) return false;
    const event = checkedReply(await response.json(), action);
    if (!event || !currentAction(action) || !await loadSdk() || !currentAction(action)) return false;
    const pixel = (window as PixelWindow).fbq;
    if (!pixel) return false;
    if (!sdkGranted) { pixel("consent", "grant"); sdkGranted = true; }
    pixel(...browserEventArguments(event));
    return true;
  } catch { return false; }
}
