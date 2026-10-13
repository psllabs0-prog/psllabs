import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroProductVisual } from "@/components/home/hero-product-visual";
import styles from "./research-home.module.css";

export function HeroSection() {
  return (
    <section className={styles.hero}>
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>PSL LABS / RESEARCH MATERIALS</p>
          <h1 className={styles.heroTitle}>Research peptides.<br /><span>Know your batch.</span></h1>
          <p className={styles.heroDescription}>Laboratory materials with clear vial amounts, current prices and original batch documentation.</p>
          <div className={styles.actions}>
            <Link href="/products" className={`${styles.button} ${styles.buttonPrimary}`}>Browse products <ArrowRight aria-hidden /></Link>
            <Link href="/coa" className={`${styles.button} ${styles.buttonSecondary}`}>View batch reports</Link>
          </div>
          <p className={styles.scope}>For laboratory research only.{" "}<br />Not for human or animal use.</p>
        </div>
        <HeroProductVisual />
      </div>
    </section>
  );
}
