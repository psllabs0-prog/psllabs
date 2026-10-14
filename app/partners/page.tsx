import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MailCheck, Link2, ReceiptText, CalendarCheck2 } from "lucide-react";
import { createPageMetadata } from "@/lib/seo";
import { getProductRender } from "@/lib/products/renders";
import { SiteBreadcrumbs } from "@/components/seo/site-breadcrumbs";
import styles from "@/components/partners/partner-program.module.css";

export const metadata = createPageMetadata({ title: "Research-Supplier Referral Partner Program", description: "Join the PSL Labs partner program. Get a personal referral code, earn 10% on eligible code orders, and track referrals with monthly manual payouts.", path: "/partners" });

const steps = [
  { icon: MailCheck, title: "Create your account", body: "Register and verify your email. Your unique referral code is issued automatically after verification." },
  { icon: Link2, title: "Share your code", body: "Refer laboratories and research teams. Clearly disclose that you may earn a commission." },
  { icon: ReceiptText, title: "Track your referrals", body: "See attributed orders, the products ordered, and your commission in your private dashboard." },
  { icon: CalendarCheck2, title: "Get paid monthly", body: "Eligible commissions are reviewed after delivery and the hold period, then paid manually each month." },
];

export default function PartnersPage() {
  const render = getProductRender("retatrutide");
  return <main className={`storefront-theme ${styles.page}`}><div className={styles.inner}>
    <SiteBreadcrumbs items={[{ name: "Home", path: "/" }, { name: "Partner program", path: "/partners" }]} />
    <section className={styles.hero}>
      <div><p className={styles.kicker}>PSL Labs / Partner program</p><h1>Connect researchers. <em>Share in the value.</em></h1><p className={styles.lead}>Introduce laboratories and research teams to PSL Labs. Your own referral code, clear order records, and 10% commission on eligible purchases.</p>
        <div className={styles.benefits}><div className={styles.benefit}><strong>10%</strong><span>Commission on eligible orders using your code</span></div><div className={styles.benefit}><strong>Monthly</strong><span>Manual payouts after delivery and review</span></div><div className={styles.benefit}><strong>No fees</strong><span>Free to join, with no partner-count limit</span></div><div className={styles.benefit}><strong>Card + Bitcoin</strong><span>Referral codes at either checkout</span></div></div>
        <div className={styles.actions}><Link href="/partners/register" className={styles.primary}>Become a partner <ArrowRight size={16} aria-hidden /></Link><Link href="/partners/account" className={styles.secondary}>Partner sign-in</Link></div><p className={styles.scope}>For laboratory research only. Not for human or animal use.</p>
      </div>
      <div className={styles.featurePanel} aria-label="Example referral commission calculation"><div className={styles.featureTop}><span>Your code. Clear records.</span><span>PSL / 10%</span></div><div className={styles.featureArtwork}>{render ? <Image src={render.src.replace("-studio.webp", "-cutout.webp")} alt="PSL Labs Retatrutide vial artwork" fill sizes="(max-width:700px) 360px, 450px" /> : null}</div><div className={styles.example}><p className={styles.exampleHeading}>One order, a clear calculation.</p><div className={styles.exampleRow}><span>Example merchandise subtotal</span><strong>$100.00</strong></div><div className={styles.exampleRow}><span>Customer’s first-order discount</span><strong>− $10.00</strong></div><div className={styles.exampleRow}><span>Eligible merchandise</span><strong>$90.00</strong></div><div className={styles.exampleTotal}><span>Your 10% commission</span><strong>$9.00</strong></div><p className={styles.exampleNote}>Illustrative calculation, not a promise of earnings. Shipping, taxes and refunded amounts are excluded.</p></div></div>
    </section>
    <section className={styles.section}><h2>From your first link to your next payout.</h2><p className={styles.sectionIntro}>A simple account with the information you need to share PSL and follow every eligible referral.</p><div className={styles.steps}>{steps.map(step => <div key={step.title}><step.icon size={24} strokeWidth={1.5} aria-hidden /><h3>{step.title}</h3><p>{step.body}</p></div>)}</div></section>
    <section className={styles.section}><div className={styles.rulesGrid}><div className={styles.ruleBox}><h3>10% for you. 10% for their first order.</h3><p>New customers receive 10% off their first eligible order when they use your code. You earn 10% of eligible merchandise after discounts on orders that use your code, including repeat orders.</p><p>Codes work with card and Bitcoin checkout. Offers do not stack, and entering a code does not enable advertising cookies.</p></div><div className={styles.ruleBox}><h3>Private records. Manual payouts.</h3><p>Your dashboard shows your attributed order references, products, quantities and commission status. Customer contact, address and payment details stay private.</p><p>Monthly payouts follow confirmed delivery, a 30-day hold and refund/fraud review. PSL records completed payments in your payout history. <Link href="/partners/terms">Read the terms</Link>.</p></div></div></section>
    <section className={styles.section}><h2>Questions before you join?</h2><div className={styles.faq}>
      <details><summary>How do I get my referral code?</summary><p>Create a partner account and verify your email through a secure one-time link. Choose an available code or let PSL generate one. After verification, your code and referral link appear in your dashboard.</p></details>
      <details><summary>Which orders earn commission?</summary><p>Eligible paid orders that use your active code can earn 10% of merchandise after discounts. Repeat orders must use your code again. Shipping, taxes, refunds, self-referrals and test orders do not earn commission.</p></details>
      <details><summary>When and how do I get paid?</summary><p>PSL reviews payable commissions monthly and pays them manually using your agreed payout details. A paid order must have confirmed delivery, complete the 30-day hold, and pass refund and fraud review. The website records the payout; it does not automatically send money.</p></details>
      <details><summary>What can I share?</summary><p>Accurate laboratory-research product information and published batch documentation, with a clear commission disclosure. Do not make medical, treatment, weight-loss or human-use claims, provide dosing instructions, or invent reviews and endorsements.</p></details>
      <details><summary>Is there a limit on partners or referrals?</summary><p>There is no fixed partner-count limit or cap on eligible referrals. Accounts and codes remain subject to the program terms and abuse or compliance review. Joining does not grant store-admin access.</p></details>
    </div></section>
    <section id="apply" className={styles.cta}><div><p className={styles.kicker}>Your next step</p><h2>Become a PSL referral partner.</h2><p>A personal code, a private dashboard, and a straightforward commission.</p></div><Link href="/partners/register" className={styles.primary}>Create your account <ArrowRight size={16} aria-hidden /></Link></section>
  </div></main>;
}
