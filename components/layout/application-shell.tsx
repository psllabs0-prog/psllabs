"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { isFinanceDemoPath } from "@/lib/finance-demo/path";
import { PLAUSIBLE_INIT_JS } from "@/lib/plausible/redact";

/** Demo documents never mount cart, attribution, analytics or advertising components. */
export function ApplicationShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isFinanceDemoPath(pathname)) return <>{children}</>;

  return <>
    <Script async src="https://plausible.io/js/pa-q336_RNw0XrNwsVUzNnQN.js" strategy="afterInteractive" />
    <Script id="plausible-init" strategy="afterInteractive">{PLAUSIBLE_INIT_JS}</Script>
    <SiteLayout>{children}</SiteLayout>
  </>;
}
