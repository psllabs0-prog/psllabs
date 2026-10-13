import Link from "next/link";

import { PSLLogo } from "@/components/branding/psl-logo";
import { CookiePreferencesButton } from "@/components/privacy/cookie-preferences";
import { FooterColumn } from "@/components/layout/footer-column";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { footerColumns, footerDisclaimer } from "@/lib/navigation";
import styles from "./storefront-shell.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerGrid}>
          <div className={styles.brand}>
            <Link
              href="/"
              className="inline-flex w-fit transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              aria-label="PSL Labs home"
            >
              <PSLLogo height={40} decorative />
            </Link>
            <p className="max-w-xs text-xs leading-relaxed text-ash">
              {footerDisclaimer}
            </p>
            <a
              href="mailto:support@psllabs.org"
              className="text-sm text-accent transition-opacity duration-200 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              support@psllabs.org
            </a>
          </div>

          {footerColumns.map((column) => (
            <FooterColumn key={column.title} {...column} />
          ))}
        </div>

        <div className={styles.footerBottom}>
          <p suppressHydrationWarning>
            © {new Date().getFullYear()} {LEGAL_ENTITY_NAME}. All rights reserved.
          </p>
          <CookiePreferencesButton />
        </div>
      </div>
    </footer>
  );
}
