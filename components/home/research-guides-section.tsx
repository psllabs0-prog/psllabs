import Link from "next/link";
import { ArrowUpRight, FileCheck2, FlaskConical, Truck } from "lucide-react";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { formatPrice } from "@/lib/cart/format";
import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import styles from "./research-home.module.css";

const guides = [
  { number: "01", title: "How to verify a peptide COA", description: "Match the batch, open the lab's original report, and check the result against the material you're buying.", href: "/guides/verify-peptide-coa" },
  { number: "02", title: "HPLC purity, identity, and content", description: "See why a purity percentage doesn't prove vial quantity or chemical identity on its own.", href: "/guides/peptide-identity-vs-purity-vs-content" },
];

export function ResearchGuidesSection() {
  return (
    <section className={`${styles.section} ${styles.guidesSection}`}>
      <div className={styles.container}>
        <ScrollReveal>
          <div className={styles.sectionHeader}>
            <div><p className={styles.eyebrow}>CHECK THE DOCUMENTATION</p><h2 className={styles.sectionTitle}>Read the report.<br />Know what it means.</h2></div>
            <Link href="/guides" className={styles.textLink}>All research guides <ArrowUpRight className="size-4" aria-hidden /></Link>
          </div>
        </ScrollReveal>
        <div className={styles.guideGrid}>
          {guides.map((guide, index) => <ScrollReveal key={guide.href} delayMs={index * 70}><Link href={guide.href} className={styles.guideCard}><span className={styles.guideNumber}>{guide.number}</span><div><h3>{guide.title}</h3><p>{guide.description}</p><span className={styles.textLink}>Read guide <ArrowUpRight className="size-4" aria-hidden /></span></div></Link></ScrollReveal>)}
        </div>
        <ScrollReveal>
          <div className={styles.orderNotes}>
            <div><FileCheck2 className="size-5 text-accent" aria-hidden /><h3>Original reports</h3><p>Check the batch and testing scope in the published lab report.</p><Link href="/coa">Browse batch reports →</Link></div>
            <div><FlaskConical className="size-5 text-accent" aria-hidden /><h3>Testing, explained</h3><p>See which measurements are reported and which conclusions they support.</p><Link href="/testing">Read about testing →</Link></div>
            <div><Truck className="size-5 text-accent" aria-hidden /><h3>Shipping, upfront</h3><p>{formatPrice(FLAT_SHIPPING_USD)} U.S. shipping. Free from {formatPrice(FREE_SHIPPING_THRESHOLD)} in products. Usually dispatches in 1–2 business days after payment clears.</p><Link href="/shipping">Shipping policy →</Link></div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
