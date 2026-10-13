import Link from "next/link";
import { ArrowRight, FileText, Grid2X2, Truck } from "lucide-react";
import { HeroProductVisual } from "@/components/home/hero-product-visual";
import styles from "./research-home.module.css";

export function HeroSection() {
  return (
    <section className={styles.hero}>
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>PSL LABS / RESEARCH MATERIALS</p>
          <h1 className={styles.heroTitle}>Research peptides.<br /><span>Know your batch.</span></h1>
          <p className={styles.heroDescription}>Check the material, vial size, price and original laboratory report before you order.</p>
          <div className={styles.actions}>
            <Link href="#materials" className={`${styles.button} ${styles.buttonPrimary}`}>Explore the catalog <ArrowRight aria-hidden /></Link>
            <Link href="/coa" className={`${styles.button} ${styles.buttonSecondary}`}>Find a batch report</Link>
          </div>
          <p className={styles.scope}>For laboratory research only. Not for human or animal use.</p>
        </div>
        <HeroProductVisual />
      </div>
      <div className={`${styles.container} ${styles.heroFooter}`} role="group" aria-label="Ordering information">
        <Link href="/coa"><FileText aria-hidden /> Original batch reports</Link>
        <span><Grid2X2 aria-hidden /> Materials, amounts and prices in view</span>
        <Link href="/shipping"><Truck aria-hidden /> U.S. shipping details upfront</Link>
      </div>
    </section>
  );
}
