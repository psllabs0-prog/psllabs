"use client";

import { usePathname } from "next/navigation";
import { isPrivacyExcludedPath } from "@/lib/privacy/client";

export function StorefrontTheme({ children, visualPreview = false }: {
  children: React.ReactNode; visualPreview?: boolean;
}) {
  const pathname = usePathname();
  return <div className={isPrivacyExcludedPath(pathname) ? undefined : "storefront-theme"}>
    {visualPreview && <aside className="design-preview-notice" aria-label="Design preview">
      Design preview · Orders, messages and advertising are disabled. Availability is preview-only.
    </aside>}
    {children}
  </div>;
}
