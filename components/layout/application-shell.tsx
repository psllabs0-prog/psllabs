"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { isFinanceDemoPath } from "@/lib/finance-demo/path";
import { PLAUSIBLE_INIT_JS } from "@/lib/plausible/redact";
import { isPrivacyExcludedPath } from "@/lib/privacy/client";
import { hasMetaBrowserSdk, metaBrowserContextAllowed, stopMetaBrowserDispatch } from "@/lib/meta-ads/browser";

let pendingDocumentNavigation: string | null = null;
function navigateDocument(destination: string) {
  pendingDocumentNavigation = destination;
  window.location.assign(destination);
}
function stopAdvertisingDispatch() {
  const advertisingWindow = window as Window & { pslGoogleAdsReady?: boolean; gtag?: (...args: unknown[]) => void };
  advertisingWindow.pslGoogleAdsReady = false;
  advertisingWindow.gtag = () => {};
  stopMetaBrowserDispatch();
}
function metaNeedsFreshDocument(destination: URL): boolean {
  return hasMetaBrowserSdk() && !metaBrowserContextAllowed(destination.href, document.referrer);
}
function subscribeDocumentUrl(notify: () => void) {
  const documentWasPrivate = isPrivacyExcludedPath(window.location.pathname);
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;
  const wrap = (original: History["pushState"]): History["pushState"] => function(data, unused, url) {
    const destination = url == null ? new URL(window.location.href) : new URL(url, window.location.href);
    if (destination.origin === window.location.origin &&
        (documentWasPrivate !== isPrivacyExcludedPath(destination.pathname) || metaNeedsFreshDocument(destination))) {
      stopAdvertisingDispatch();
      navigateDocument(destination.href);
      return;
    }
    original.call(history, data, unused, url);
    notify();
  };
  const wrappedPush = wrap(push);
  const wrappedReplace = wrap(replace);
  history.pushState = wrappedPush;
  history.replaceState = wrappedReplace;
  const onHistory = () => {
    if (documentWasPrivate !== isPrivacyExcludedPath(window.location.pathname) ||
        metaNeedsFreshDocument(new URL(window.location.href))) {
      stopAdvertisingDispatch();
      // Back/forward already committed the complete destination, including its
      // private receipt query. Reload that document, never an earlier route.
      pendingDocumentNavigation = window.location.href;
      window.location.reload();
    }
    notify();
  };
  window.addEventListener("popstate", onHistory);
  window.addEventListener("hashchange", onHistory);
  return () => {
    if (history.pushState === wrappedPush) history.pushState = push;
    if (history.replaceState === wrappedReplace) history.replaceState = replace;
    window.removeEventListener("popstate", onHistory);
    window.removeEventListener("hashchange", onHistory);
  };
}
const readDocumentUrl = () => window.location.href;
const serverDocumentUrl = () => "";

/** Demo documents never mount cart, attribution, analytics or advertising components. */
export function ApplicationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const actualUrl = useSyncExternalStore(subscribeDocumentUrl, readDocumentUrl, serverDocumentUrl);
  const [privateDocument] = useState(() => isPrivacyExcludedPath(pathname));
  const crossesPrivacyBoundary = privateDocument !== isPrivacyExcludedPath(pathname);
  let crossesMetaBoundary = false;
  if (actualUrl && hasMetaBrowserSdk()) {
    const destination = new URL(actualUrl);
    // Next can render the next pathname before its HistoryUpdater commits it.
    // Check that destination too, before any private child component can mount.
    destination.pathname = pathname;
    crossesMetaBoundary = metaNeedsFreshDocument(new URL(actualUrl)) || metaNeedsFreshDocument(destination);
  }
  const requiresFreshDocument = crossesPrivacyBoundary || crossesMetaBoundary;

  // A script survives an SPA component unmount. Cross this boundary with a new
  // document so an advertising SDK loaded in the store cannot observe admin data.
  useEffect(() => {
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
          event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin ||
          (privateDocument === isPrivacyExcludedPath(destination.pathname) && !metaNeedsFreshDocument(destination))) return;
      event.preventDefault();
      event.stopPropagation();
      stopAdvertisingDispatch();
      navigateDocument(destination.href);
    };
    document.addEventListener("click", navigate, true);
    return () => document.removeEventListener("click", navigate, true);
  }, [privateDocument]);

  // Covers programmatic navigation and browser history as well as links.
  useLayoutEffect(() => {
    if (!requiresFreshDocument) return;
    stopAdvertisingDispatch();
    // Next may render the next pathname before committing its full URL. Its
    // history operation below will preserve the real query and hard-navigate.
    // Never override a pending assign or reload the preceding public page.
    if (pendingDocumentNavigation || window.location.pathname !== pathname) return;
    window.location.reload();
  }, [requiresFreshDocument, pathname, actualUrl]);
  if (requiresFreshDocument) return null;
  if (isFinanceDemoPath(pathname)) return <>{children}</>;

  return <>
    <Script async src="https://plausible.io/js/pa-q336_RNw0XrNwsVUzNnQN.js" strategy="afterInteractive" />
    <Script id="plausible-init" strategy="afterInteractive">{PLAUSIBLE_INIT_JS}</Script>
    <SiteLayout>{children}</SiteLayout>
  </>;
}
