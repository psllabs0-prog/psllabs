"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { readPrivacyConsent, serverPrivacyConsent, subscribePrivacyConsent } from "@/lib/privacy/client";

/** Prepared, unmounted server receipt verification only. No TikTok browser SDK is loaded on private order URLs. */
export function TikTokAdsPurchaseReceipt({ orderId, paid }: { orderId: string; paid: boolean }) {
  const consent = useSyncExternalStore(subscribePrivacyConsent, readPrivacyConsent, serverPrivacyConsent);
  const attempted = useRef(new Set<string>());
  const attemptCounts = useRef(new Map<string, number>());
  useEffect(() => {
    const permitted = () => {
      const current = readPrivacyConsent();
      return paid && current.choice === "saved" && current.measurement && current.personalization &&
        current.capabilities.tiktokMeasurement && current.capabilities.tiktokPersonalization &&
        !current.gpc && !current.admin && current.revision === consent.revision;
    };
    if (!permitted() || !/^psl_[A-Za-z0-9_-]{1,100}$/.test(orderId)) return;
    const key = `${orderId}:${consent.version}:${consent.revision}`;
    if (attempted.current.has(key)) return;
    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (cancelled || !permitted()) return;
      const count = attemptCounts.current.get(key) ?? 0;
      if (count >= 3) { attempted.current.add(key); return; }
      attemptCounts.current.set(key, count + 1);
      try {
        const response = await fetch("/api/tiktok/purchase", { method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }), signal: controller.signal });
        if (!cancelled && permitted() && response.ok && (await response.json()).purchase === "accepted") {
          attempted.current.add(key); return;
        }
      } catch { /* Never interfere with a real order confirmation. */ }
      if (!cancelled && permitted() && count < 2) timer = setTimeout(() => void check(), 2500);
      else if (!cancelled) attempted.current.add(key);
    };
    void check();
    return () => { cancelled = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [orderId, paid, consent]);
  return null;
}
