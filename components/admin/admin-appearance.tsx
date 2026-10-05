import type { ReactNode } from "react";

import { isAdminAuthenticated } from "@/lib/admin/auth";

import { AdminReturnNav } from "./admin-workspace-nav";
import styles from "./admin-appearance.module.css";

/**
 * Shared admin appearance, never mounted by the storefront.
 * Session read controls only the return navigation; no business data or actions.
 * Existing page authentication and every disabled/approval state are unchanged.
 */
export default async function AdminAppearance({ children }: { children: ReactNode }) {
  const authenticated = await isAdminAuthenticated();
  return (
    <div className={styles.root} data-psl-admin-appearance="light">
      {authenticated && <AdminReturnNav />}
      {children}
    </div>
  );
}
