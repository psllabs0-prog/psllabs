import Link from "next/link";

import { PSLLogo } from "@/components/branding/psl-logo";
import { CookiePreferencesButton } from "@/components/privacy/cookie-preferences";
import { FooterColumn } from "@/components/layout/footer-column";
import { LEGAL_ENTITY_NAME } from "@/lib/content/testing-scope";
import { footerDisclaimer } from "@/lib/navigation";
import styles from "./footer.module.css";

const columns = [
  { title: "Materials & documentation", links: [
    { label: "Product catalog", href: "/products" },
    { label: "Batch reports", href: "/coa" },
    { label: "Testing scope", href: "/testing" },
    { label: "Research guides", href: "/guides" },
  ] },
  { title: "Order support", links: [
    { label: "Contact", href: "/contact" },
    { label: "Frequently asked questions", href: "/faq" },
    { label: "Shipping", href: "/shipping" },
    { label: "Returns", href: "/returns" },
    { label: "Track an order", href: "/track" },
  ] },
  { title: "PSL Labs", links: [
    { label: "About", href: "/about" },
    { label: "Partner program", href: "/partners" },
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
    { label: "Disclaimer", href: "/disclaimer" },
  ] },
];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerGrid}>
          <div className={styles.brand}>
            <Link
              href="/"
              className={styles.logo}
              aria-label="PSL Labs home"
            >
              <PSLLogo height={44} decorative />
            </Link>
            <p className={styles.brandDescription}>Materials for laboratory research.<br />Phoenix, Arizona · United States.</p>
            <a
              href="mailto:support@psllabs.org"
              className={styles.support}
            >
              support@psllabs.org
            </a>
          </div>

          {columns.map((column) => (
            <FooterColumn key={column.title} {...column} />
          ))}
        </div>
        <p className={styles.disclosure}>{footerDisclaimer}</p>
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
