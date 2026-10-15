import Link from "next/link";
import { PSLLogo } from "@/components/branding/psl-logo";
import { ResearchUseBanner } from "@/components/layout/research-use-banner";
import { CookieConsentControls, CookiePreferencesButton } from "@/components/privacy/cookie-preferences";
import styles from "./research-account.module.css";

/** Pre-login documents deliberately have no catalog navigation, cart or measurement SDKs. */
export function ResearchAccountShell({ children, legal = false }: { children: React.ReactNode; legal?: boolean }) {
  return <div className={`storefront-theme ${styles.shell}`}>
    <header className={styles.header}><Link href="/research-account/sign-in" aria-label="PSL Labs research-account sign-in"><PSLLogo height={40} eager /></Link><span>Laboratory research materials</span></header>
    <ResearchUseBanner />
    <div id="main-content" className={styles.content}>{children}</div>
    <footer className={styles.footer}><span>PSL Group LLC · Phoenix, Arizona</span><nav aria-label="Account and policy navigation"><Link href="/research-account/sign-in">Sign in</Link><Link href="/research-account/sign-up">Create account</Link><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/contact">Contact</Link>{legal && <CookiePreferencesButton />}</nav></footer>
    {legal && <CookieConsentControls standalone />}
  </div>;
}
