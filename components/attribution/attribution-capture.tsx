"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { captureAttributionFromLocation } from "@/lib/attribution/storage";
import { readPrivacyConsent, serverPrivacyConsent, subscribePrivacyConsent } from "@/lib/privacy/client";

/**
 * Captures paid UTMs / click IDs into a 30-day localStorage window.
 * Direct navigations do not overwrite an existing paid touch.
 */
export function AttributionCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const consent = useSyncExternalStore(subscribePrivacyConsent, readPrivacyConsent, serverPrivacyConsent);

  useEffect(() => {
    const search = searchParams?.toString()
      ? `?${searchParams.toString()}`
      : "";
    const href = `${window.location.origin}${pathname || "/"}${search}`;
    captureAttributionFromLocation(href, document.referrer);
  }, [pathname, searchParams, consent]);

  return null;
}
