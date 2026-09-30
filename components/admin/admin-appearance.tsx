import type { ReactNode } from "react";

import styles from "./admin-appearance.module.css";

/**
 * Presentation only. Mounted by /admin-* layouts, never by the storefront.
 * No pathname effects, global DOM mutations, data access, or action handlers.
 * Existing page authentication and every disabled/approval state are unchanged.
 */
export default function AdminAppearance({ children }: { children: ReactNode }) {
  return (
    <div className={styles.root} data-psl-admin-appearance="light">
      {children}
    </div>
  );
}
