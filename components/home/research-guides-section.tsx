import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, FileText, FlaskConical, Truck } from "lucide-react";
import { formatPrice } from "@/lib/cart/format";
import { FLAT_SHIPPING_USD, FREE_SHIPPING_THRESHOLD } from "@/lib/cart/constants";
import { getBatchReportsForProduct } from "@/lib/batch-reports";
import styles from "./research-home.module.css";

const guides = [
  { title: "How to verify a peptide COA", description: "Match the batch, open the lab's original report, and check the result against the material you're buying.", href: "/guides/verify-peptide-coa" },
  { title: "HPLC purity, identity, and content", description: "See why a purity percentage doesn't prove vial quantity or chemical identity on its own.", href: "/guides/peptide-identity-vs-purity-vs-content" },
];

export function ResearchGuidesSection() {
  const report = getBatchReportsForProduct("retatrutide").find((candidate) => candidate.status === "report_available" && Boolean(candidate.reportUrl));
  return (
    <section id="documentation" className={styles.documentationSection}>
      <div className={styles.container}>
        <div className={styles.documentationGrid}>
          <div className={styles.documentationCopy}>
            {report && <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open original ${report.product} report, task ${report.taskNumber}`}><Image src={report.reportUrl} alt={report.reportAltText} width={148} height={197} sizes="(max-width: 359px) 83px, (max-width: 800px) 102px, (max-width: 1100px) 118px, 148px" className={styles.reportThumbnail} /></a>}
            <div>
              <p className={styles.eyebrow}>BATCH DOCUMENTATION</p>
              <h2 className={styles.sectionTitle}>Read the original.</h2>
              <p className={styles.documentationDescription}>Match your vial lot to the published report. Results apply only to the named sample and tests performed.</p>
              {report && <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" className={styles.textLink}>Task {report.taskNumber} <ArrowUpRight aria-hidden /></a>}
            </div>
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
              <div><h3>Shipping, upfront</h3><p>{formatPrice(FLAT_SHIPPING_USD)} U.S. shipping. Free from {formatPrice(FREE_SHIPPING_THRESHOLD)} in products. Usually ships within 24 hours after payment clears.</p></div>
              <ArrowUpRight aria-hidden />
            </Link>
          </div>
        </div>
        <div className={styles.guideGrid}>
          {guides.map((guide) => (
            <Link href={guide.href} key={guide.href} className={styles.guideCard}>
              <div><h3>{guide.title}</h3><p>{guide.description}</p><span className={styles.textLink}>Read guide <ArrowUpRight aria-hidden /></span></div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
