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
          <h1 className={styles.heroTitle}>Know your<br /><span>material.</span></h1>
          <p className={styles.heroDescription}>Compare research materials, vial amounts and original batch reports.</p>
          <div className={styles.actions}>
            <Link href="/products" className={`${styles.button} ${styles.buttonPrimary}`}>Browse materials <ArrowRight aria-hidden /></Link>
            <Link href="/coa" className={`${styles.button} ${styles.buttonSecondary}`}>Batch documentation</Link>
          </div>
          <p className={styles.scope}>For laboratory research only.{" "}<br />Not for human or animal use.</p>
        </div>
        <HeroProductVisual />
      </div>
    </section>
  );
}
