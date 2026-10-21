import Link from "next/link";
import { PSLLogo } from "@/components/branding/psl-logo";
import { CookieConsentControls, CookiePreferencesButton } from "@/components/privacy/cookie-preferences";
import styles from "./research-account.module.css";

/** Legal and payment-recovery documents do not load advertising SDKs. */
export function ResearchAccountShell({ children, legal = false }: { children: React.ReactNode; legal?: boolean }) {
  return <div className={`storefront-theme ${styles.shell}`}>
    <header className={styles.header}><Link href="/" aria-label="PSL Labs home"><PSLLogo height={40} eager /></Link><span>Laboratory research materials</span></header>
    <div id="main-content" className={styles.content}>{children}</div>
    <footer className={styles.footer}><span>PSL Group LLC · Phoenix, Arizona</span><nav aria-label="Account and policy navigation"><Link href="/products">Catalog</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/contact">Contact</Link>{legal && <CookiePreferencesButton />}</nav></footer>
    {legal && <CookieConsentControls standalone />}
  </div>;
}
