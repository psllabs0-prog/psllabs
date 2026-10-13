import Link from "next/link";
import { ArrowUpRight, FileText, FlaskConical, Truck } from "lucide-react";
import { formatPrice } from "@/lib/cart/format";
import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import styles from "./research-home.module.css";

const guides = [
  { number: "01", title: "How to verify a peptide COA", description: "Match the batch, open the lab's original report, and check the result against the material you're buying.", href: "/guides/verify-peptide-coa" },
  { number: "02", title: "HPLC purity, identity, and content", description: "See why a purity percentage doesn't prove vial quantity or chemical identity on its own.", href: "/guides/peptide-identity-vs-purity-vs-content" },
];

export function ResearchGuidesSection() {
  return (
    <section id="documentation" className={styles.documentationSection}>
      <div className={styles.container}>
        <div className={styles.documentationGrid}>
          <div className={styles.documentationCopy}>
            <p className={styles.eyebrow}>BATCH DOCUMENTATION</p>
            <h2 className={styles.sectionTitle}>Read the original.</h2>
            <p className={styles.documentationDescription}>Match your vial lot to the published report. Results apply only to the named sample and tests performed.</p>
            <Link href="/guides" className={styles.textLink}>All research guides <ArrowUpRight aria-hidden /></Link>
          </div>
          <div className={styles.documentationLinks}>
            <Link href="/coa" className={styles.documentLink}>
              <FileText aria-hidden />
              <div><h3>Original batch reports</h3><p>Check the batch and testing scope in the published report.</p></div>
              <ArrowUpRight aria-hidden />
            </Link>
            <Link href="/testing" className={styles.documentLink}>
              <FlaskConical aria-hidden />
              <div><h3>Testing, explained</h3><p>See which measurements are reported and which conclusions they support.</p></div>
              <ArrowUpRight aria-hidden />
            </Link>
            <Link href="/shipping" className={styles.documentLink}>
              <Truck aria-hidden />
              <div><h3>Shipping, upfront</h3><p>{formatPrice(FLAT_SHIPPING_USD)} U.S. shipping. Free from {formatPrice(FREE_SHIPPING_THRESHOLD)} in products. Usually dispatches in 1–2 business days after payment clears.</p></div>
              <ArrowUpRight aria-hidden />
            </Link>
          </div>
        </div>
        <div className={styles.guideGrid}>
          {guides.map((guide) => (
            <Link href={guide.href} key={guide.href} className={styles.guideCard}>
              <span className={styles.guideNumber}>{guide.number}</span>
              <div><h3>{guide.title}</h3><p>{guide.description}</p><span className={styles.textLink}>Read guide <ArrowUpRight aria-hidden /></span></div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
