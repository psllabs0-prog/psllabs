"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useCart } from "@/components/cart/cart-provider";
import {
  createTikTokBrowserAction, dispatchTikTokBrowserAction, hasTikTokBrowserSdk,
  tikTokBrowserPermission, stopTikTokBrowserDispatch,
} from "@/lib/tiktok-ads/browser";
import { REVIEWED_TIKTOK_PRODUCTS } from "@/lib/tiktok-ads/events";
import { readPrivacyConsent, serverPrivacyConsent, subscribePrivacyConsent } from "@/lib/privacy/client";

/** This component is prepared, unmounted, and additionally gated by verified capabilities. */
export function TikTokAdsMeasurement() {
  const pathname = usePathname();
  const search = useSearchParams();
  const consent = useSyncExternalStore(subscribePrivacyConsent, readPrivacyConsent, serverPrivacyConsent);
  const { items, isHydrated } = useCart();
  const pageObserved = useRef("");
  const checkoutObserved = useRef("");
  const reloading = useRef(false);
  const routeKey = `${pathname}?${search.toString()}`;
  useEffect(() => {
    if (!tikTokBrowserPermission() && hasTikTokBrowserSdk() && !reloading.current) {
      reloading.current = true; stopTikTokBrowserDispatch(); window.location.reload(); return;
    }
    if (pageObserved.current === routeKey || !tikTokBrowserPermission()) return;
    pageObserved.current = routeKey;
    void dispatchTikTokBrowserAction(createTikTokBrowserAction("Pageview"));
    const product = REVIEWED_TIKTOK_PRODUCTS.find((p) => p.path === pathname);
    if (product) void dispatchTikTokBrowserAction(createTikTokBrowserAction("ViewContent", [product.sku]));
  }, [routeKey, pathname, consent]);
  useEffect(() => {
    if (pathname !== "/checkout") { checkoutObserved.current = ""; return; }
    if (!isHydrated || checkoutObserved.current === routeKey || !items.length || !tikTokBrowserPermission()) return;
    const products = items.map((item) => REVIEWED_TIKTOK_PRODUCTS.find((p) => p.handle === item.handle));
    if (products.some((product) => !product)) return;
    checkoutObserved.current = routeKey;
    void dispatchTikTokBrowserAction(createTikTokBrowserAction("InitiateCheckout", [...new Set(products.map((p) => p!.sku))]));
  }, [pathname, routeKey, items, isHydrated, consent]);
  return null;
}
