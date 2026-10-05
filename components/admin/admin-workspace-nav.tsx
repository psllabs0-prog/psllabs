"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_GROUPS, ADMIN_VIEWS, adminViewHref, resolveAdminView, type AdminViewId } from "@/lib/admin/navigation";

import styles from "./admin-workspace.module.css";

export function AdminWorkspaceNav({ selectedView }: { selectedView: AdminViewId }) {
  const selected = resolveAdminView(selectedView);
  const group = ADMIN_GROUPS.find((item) => item.id === selected.group)!;

  return (
    <div className={styles.navigation}>
      <div className={styles.heading}>
        <p className={styles.brand}>PSL Labs <span>Admin</span></p>
        <p className={styles.hint}>One place to check in and get things done.</p>
      </div>
      <nav aria-label="Admin sections">
        <ul className={styles.groups}>
          {ADMIN_GROUPS.map((item) => (
            <li key={item.id}>
              <Link
                href={adminViewHref(item.defaultView)}
                prefetch={false}
                scroll={false}
                aria-current={selected.group === item.id ? "true" : undefined}
                className={styles.groupLink}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label={`${group.label} tools`}>
        <ul className={styles.views}>
          {ADMIN_VIEWS.filter((item) => item.group === selected.group).map((item) => (
            <li key={item.id}>
              <Link
                href={adminViewHref(item.id)}
                prefetch={false}
                scroll={false}
                aria-current={item.id === selected.id ? "page" : undefined}
                className={styles.viewLink}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** The layout renders this only after checking the same admin session as the page. */
export function AdminReturnNav() {
  const pathname = usePathname();
  if (pathname === "/admin") return null;

  return (
    <nav className={styles.returnNav} aria-label="Admin workspace">
      <Link href="/admin" prefetch={false} className={styles.returnLink}>
        <span aria-hidden="true">←</span> Admin home
      </Link>
    </nav>
  );
}
