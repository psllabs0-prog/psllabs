"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useCart } from "@/components/cart/cart-provider";
import {
  createMetaBrowserAction, dispatchMetaBrowserAction, hasMetaBrowserSdk,
  metaBrowserPermission, stopMetaBrowserDispatch,
} from "@/lib/meta-ads/browser";
import { REVIEWED_META_PRODUCTS } from "@/lib/meta-ads/events";
import { readPrivacyConsent, serverPrivacyConsent, subscribePrivacyConsent } from "@/lib/privacy/client";

/** Inactive unless the server explicitly exposes both verified Meta capabilities. */
export function MetaAdsMeasurement() {
  const pathname = usePathname();
  const search = useSearchParams();
  const consent = useSyncExternalStore(subscribePrivacyConsent, readPrivacyConsent, serverPrivacyConsent);
  const { items, isHydrated } = useCart();
  const pageObserved = useRef("");
  const checkoutObserved = useRef("");
  const reloading = useRef(false);
  const routeKey = `${pathname}?${search.toString()}`;

  useEffect(() => {
    if (!metaBrowserPermission() && hasMetaBrowserSdk() && !reloading.current) {
      reloading.current = true;
      stopMetaBrowserDispatch();
      window.location.reload();
      return;
    }
    if (pageObserved.current === routeKey) return;
    if (!metaBrowserPermission()) return;
    // Verify consent first, then observe only the page that is currently visible.
    // No previous routes or pre-consent cart actions are queued for replay.
    pageObserved.current = routeKey;
    void dispatchMetaBrowserAction(createMetaBrowserAction("PageView"));
    const product = REVIEWED_META_PRODUCTS.find((entry) => entry.path === pathname);
    if (product) void dispatchMetaBrowserAction(createMetaBrowserAction("ViewContent", [product.sku]));
  }, [routeKey, pathname, consent]);

  useEffect(() => {
    if (pathname !== "/checkout") { checkoutObserved.current = ""; return; }
    if (!isHydrated || checkoutObserved.current === routeKey) return;
    if (!items.length || !metaBrowserPermission()) return;
    checkoutObserved.current = routeKey;
    const products = items.map((item) => REVIEWED_META_PRODUCTS.find((entry) => entry.handle === item.handle));
    if (products.some((product) => !product)) return;
    void dispatchMetaBrowserAction(createMetaBrowserAction("InitiateCheckout", products.map((product) => product!.sku)));
  }, [pathname, routeKey, items, isHydrated, consent]);
  return null;
}
