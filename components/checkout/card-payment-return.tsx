"use client";

import { useCallback, useSyncExternalStore } from "react";
import { ExpiredCardConfirmation } from "@/components/checkout/tagada-card-form";
import { cardSessionStore, getCardReturnHints } from "@/lib/checkout/card-session-storage";

function subscribeToUrl(listener: () => void) {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}
const getSearch = () => window.location.search;
const getServerSearch = () => "";

/** Payment reconciliation only: never mounts card fields or creates another order. */
export function CardPaymentReturn() {
  const retained = useSyncExternalStore(cardSessionStore.subscribe, cardSessionStore.getSnapshot, cardSessionStore.getServerSnapshot);
  const search = useSyncExternalStore(subscribeToUrl, getSearch, getServerSearch);
  const complete = useCallback((redirectTo: string) => {
    cardSessionStore.clear();
    window.location.href = redirectTo;
  }, []);
  const ignoreReportedError = useCallback(() => {}, []);
  const hints = retained?.confirmation ?? getCardReturnHints(search);

  return <main className="storefront-theme public-page-surface min-h-[60vh] bg-paper px-6 py-16 md:px-16 md:py-20">
    <div className="premium-card public-section-card mx-auto max-w-lg p-6">
      {retained?.orderId ? <ExpiredCardConfirmation orderId={retained.orderId} hints={hints}
        onError={ignoreReportedError} onSuccessRedirect={complete} /> : <>
        <h1 className="font-display text-2xl font-bold text-ink">Check your original card payment</h1>
        <p role="status" className="mt-4 text-sm leading-relaxed text-ash">The original checkout is not available in this tab. Contact support to confirm your payment before placing another order.</p>
        <a href="mailto:support@psllabs.org" className="mt-6 inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-4">Contact support@psllabs.org</a>
      </>}
    </div>
  </main>;
}
