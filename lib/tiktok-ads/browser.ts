import { readPrivacyConsent } from "../privacy/client";
import { TIKTOK_BROWSER_VERIFIED } from "./config";
import {
  PRODUCTION_TIKTOK_EVENT_POLICY, PSL_TIKTOK_PIXEL_ID, REVIEWED_TIKTOK_PRODUCTS,
  tikTokBrowserEventArguments, tikTokSourceUrlAllowed, type PreparedTikTokEvent, type TikTokEventName,
} from "./events";

export type TikTokBrowserEventName = Exclude<TikTokEventName, "Purchase">;
export type TikTokBrowserAction = {
  name: TikTokBrowserEventName; eventId: string; sourceUrl: string; productIds?: string[];
  consentRevision: number; createdAt: number;
};
type PixelQueue = unknown[][] & {
  methods: string[]; _i: Record<string, PixelQueue>; _t: Record<string, number>; _o: Record<string, Record<string, unknown>>;
  _mounted?: boolean; _init?: boolean;
  [key: string]: unknown;
};
type PixelWindow = Window & { TiktokAnalyticsObject?: string; ttq?: PixelQueue };
let sdkOwned = false;
let ownedPixel: PixelQueue | null = null;
let sdkStopped = false;
let sdkReady: Promise<boolean> | null = null;
const attempted = new Set<string>();
const eventNames: TikTokBrowserEventName[] = ["Pageview", "ViewContent", "AddToCart", "InitiateCheckout"];

export function tikTokBrowserContextAllowed(sourceUrl: string, referrer: string): boolean {
  if (!eventNames.some((name) => tikTokSourceUrlAllowed(sourceUrl, name, PRODUCTION_TIKTOK_EVENT_POLICY))) return false;
  if (!referrer) return true;
  try {
    const url = new URL(referrer);
    if (["https://www.psllabs.org", "https://psllabs.org"].includes(url.origin)) {
      return eventNames.some((name) => tikTokSourceUrlAllowed(referrer, name, PRODUCTION_TIKTOK_EVENT_POLICY));
    }
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/" && ["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(url.hostname);
  } catch { return false; }
}
export function tikTokBrowserPermission(): boolean {
  if (!TIKTOK_BROWSER_VERIFIED || typeof window === "undefined" || typeof document === "undefined") return false;
  const consent = readPrivacyConsent();
  return consent.choice === "saved" && consent.measurement && consent.personalization &&
    consent.capabilities.tiktokMeasurement === true && consent.capabilities.tiktokPersonalization === true &&
    !consent.gpc && !consent.admin && !sdkStopped && tikTokBrowserContextAllowed(window.location.href, document.referrer);
}
export const hasTikTokBrowserSdk = () => sdkOwned;
function call(pixel: PixelQueue, method: string, ...args: unknown[]) {
  const command = pixel[method];
  if (typeof command !== "function") return false;
  command.apply(pixel, args);
  return true;
}
export function stopTikTokBrowserDispatch(): void {
  if (sdkStopped) return;
  if (ownedPixel) {
    try { call(ownedPixel, "revokeConsent"); } catch { /* Local guard still stops dispatch; replace the document. */ }
    ownedPixel.length = 0;
    for (const instance of Object.values(ownedPixel._i)) instance.length = 0;
    // The native SDK freezes some method properties; its revokeConsent call and
    // the immediate fresh-document boundary, not replacing methods, stop it.
  }
  sdkStopped = true;
}
export function createTikTokBrowserAction(name: TikTokBrowserEventName, productIds?: readonly string[]): TikTokBrowserAction | null {
  if (!tikTokBrowserPermission() || !eventNames.includes(name) ||
      !tikTokSourceUrlAllowed(window.location.href, name, PRODUCTION_TIKTOK_EVENT_POLICY) || !window.crypto?.randomUUID) return null;
  const ids = [...(productIds ?? [])];
  if ((name === "Pageview" && ids.length) || (name !== "Pageview" && (!ids.length || ids.length > 10 ||
      new Set(ids).size !== ids.length || ids.some((id) => !PRODUCTION_TIKTOK_EVENT_POLICY.approvedProductIds.includes(id))))) return null;
  const product = REVIEWED_TIKTOK_PRODUCTS.find((p) => p.path === window.location.pathname);
  if ((name === "ViewContent" || name === "AddToCart") && (!product || ids.length !== 1 || ids[0] !== product.sku)) return null;
  return { name, eventId: window.crypto.randomUUID(), sourceUrl: window.location.href,
    ...(ids.length ? { productIds: ids } : {}), consentRevision: readPrivacyConsent().revision, createdAt: Date.now() };
}
function currentAction(action: TikTokBrowserAction): boolean {
  return tikTokBrowserPermission() && readPrivacyConsent().revision === action.consentRevision &&
    window.location.href === action.sourceUrl && Date.now() - action.createdAt >= 0 && Date.now() - action.createdAt < 60_000;
}
function checkedReply(value: unknown, action: TikTokBrowserAction): PreparedTikTokEvent | null {
  const event = (value as { event?: PreparedTikTokEvent } | null)?.event;
  if (!event || Object.keys(event).some((k) => !["event", "event_id", "event_time", "page", "properties"].includes(k)) ||
      event.event !== action.name || event.event_id !== action.eventId || !event.page ||
      Object.keys(event.page).some((k) => k !== "url") || event.page.url !== action.sourceUrl ||
      !Number.isSafeInteger(event.event_time) || Math.abs(Date.now() / 1000 - event.event_time) > 300) return null;
  const ids = action.productIds ?? [];
  if (!ids.length) return event.properties ? null : event;
  const data = event.properties;
  return !data || Object.keys(data).some((k) => !["content_ids", "content_type"].includes(k)) ||
    data.content_type !== "product" || JSON.stringify(data.content_ids) !== JSON.stringify(ids) ? null : event;
}
function defer(pixel: PixelQueue, method: string) {
  pixel[method] = (...args: unknown[]) => { if (!sdkStopped) pixel.push([method, ...args]); };
}
function loadSdk(): Promise<boolean> {
  if (sdkReady) return sdkReady;
  const target = window as PixelWindow;
  if (!tikTokBrowserPermission() || target.ttq || target.TiktokAnalyticsObject || !PSL_TIKTOK_PIXEL_ID) return Promise.resolve(false);
  const pixel = [] as unknown as PixelQueue;
  pixel.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group",
    "enableCookie", "disableCookie", "revokeConsent", "grantConsent"];
  for (const method of pixel.methods) defer(pixel, method);
  pixel._i = {}; pixel._t = {}; pixel._o = {};
  pixel.instance = (id: string) => {
    const instance = pixel._i[id] ?? ([] as unknown as PixelQueue);
    for (const method of pixel.methods) defer(instance, method);
    return instance;
  };
  target.TiktokAnalyticsObject = "ttq"; target.ttq = pixel;
  ownedPixel = pixel; sdkOwned = true;
  // Called only after a current affirmative grant. No pre-consent SDK request,
  // event queue, holdConsent replay, identify call or automatic page() exists.
  call(pixel, "revokeConsent");
  pixel._i[PSL_TIKTOK_PIXEL_ID] = [] as unknown as PixelQueue;
  pixel._i[PSL_TIKTOK_PIXEL_ID]._u = "https://analytics.tiktok.com/i18n/pixel/events.js";
  pixel._t[PSL_TIKTOK_PIXEL_ID] = Date.now();
  // Supported options in the current official TikTok SDK. Native pixel automatic
  // matching, enhanced postback and auto events must additionally remain disabled.
  pixel._o[PSL_TIKTOK_PIXEL_ID] = { autoConfig: false, autoConfigListener: false, historyObserver: false };
  sdkReady = new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const finish = (ready: boolean) => { if (settled) return; settled = true; if (timer) clearTimeout(timer); resolve(ready); };
    // events.js loads a second SDK script. Its loader's onload is not readiness,
    // and the current native SDK does not implement the old deferred ready API.
    const checkReady = () => {
      if (!tikTokBrowserPermission() || Date.now() - startedAt >= 7000) { finish(false); return; }
      if (pixel._mounted && pixel._i[PSL_TIKTOK_PIXEL_ID]?._init) { finish(true); return; }
      timer = setTimeout(checkReady, 50);
    };
    const script = document.createElement("script");
    script.id = "psl-tiktok-pixel"; script.type = "text/javascript"; script.async = true;
    script.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${PSL_TIKTOK_PIXEL_ID}&lib=ttq`;
    script.onerror = () => finish(false);
    document.head.appendChild(script);
    checkReady();
  });
  return sdkReady;
}
/** One action ID for both channels, no retries or previous-action replay. */
export async function dispatchTikTokBrowserAction(action: TikTokBrowserAction | null): Promise<boolean> {
  if (!action || !currentAction(action) || attempted.has(action.eventId)) return false;
  attempted.add(action.eventId);
  try {
    const response = await fetch("/api/tiktok/events", { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: action.name, eventId: action.eventId,
        sourceUrl: action.sourceUrl, ...(action.productIds ? { productIds: action.productIds } : {}) }) });
    if (!response.ok || !currentAction(action)) return false;
    const event = checkedReply(await response.json(), action);
    if (!event || !currentAction(action) || !await loadSdk() || !currentAction(action)) return false;
    const pixel = (window as PixelWindow).ttq;
    if (!pixel || pixel !== ownedPixel) return false;
    call(pixel, "grantConsent");
    return call(pixel, "track", ...tikTokBrowserEventArguments(event));
  } catch { return false; }
}
