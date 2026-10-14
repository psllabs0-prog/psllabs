import { PartnerApplicationForm } from "@/components/partners/partner-application-form";
import { SiteBreadcrumbs } from "@/components/seo/site-breadcrumbs";
import { isDesignPreview } from "@/lib/design-preview";
import { createPageMetadata } from "@/lib/seo";
import styles from "@/components/partners/partner-program.module.css";
export const metadata = createPageMetadata({ title: "Create Your PSL Labs Referral Partner Account", description: "Create a PSL Labs partner account with secure email sign-in. Choose your referral code and track eligible orders and monthly manual commissions.", path: "/partners/register" });
export default function PartnerRegistrationPage() {
  return <main className={`storefront-theme ${styles.page}`}><div className={styles.inner}><SiteBreadcrumbs items={[{ name: "Home", path: "/" }, { name: "Partner program", path: "/partners" }, { name: "Create account", path: "/partners/register" }]} /><div className={styles.registration}><header className={styles.registrationIntro}><p className={styles.kicker}>PSL Labs / Partner program</p><h1>Your code starts here.</h1><p className={styles.lead}>Create your account, verify your email, and get a referral code for sharing with laboratories and research teams.</p></header><PartnerApplicationForm preview={isDesignPreview()} /></div></div></main>;
}
