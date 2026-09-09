"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { captureAttributionFromLocation } from "@/lib/attribution/storage";

/**
 * Captures paid UTMs / click IDs into a 30-day localStorage window.
 * Direct navigations do not overwrite an existing paid touch.
 */
export function AttributionCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams?.toString()
      ? `?${searchParams.toString()}`
      : "";
    const href = `${window.location.origin}${pathname || "/"}${search}`;
    captureAttributionFromLocation(href, document.referrer);
  }, [pathname, searchParams]);

  return null;
}
