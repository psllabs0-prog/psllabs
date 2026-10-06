import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { HeroProductVisual } from "@/components/home/hero-product-visual";
import { PillButton } from "@/components/ui/pill-button";
import styles from "./research-home.module.css";

export function HeroSection() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroGrid}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>PSL LABS / RESEARCH MATERIALS</p>
          <h1 className={styles.heroTitle}>Research peptides.<br /><span>Know your batch.</span></h1>
          <p className={styles.heroDescription}>Start with the material. Check the vial size, price, and original lab report before you order.</p>
          <div className={styles.actions}>
            <PillButton href="#materials" className="gap-3 text-sm">Explore the catalog <ArrowRight className="size-4" aria-hidden /></PillButton>
            <PillButton href="/coa" variant="secondary" className="text-sm">Find a batch report</PillButton>
          </div>
          <div className={styles.heroNotes}>
            <p>Ships to all 50 states.</p>
            <Link href="/shipping">Shipping details <ArrowUpRight className="size-3.5" aria-hidden /></Link>
          </div>
          <p className={styles.scope}>For laboratory research only. Not for human or animal use.</p>
        </div>
        <div className={styles.heroVisual}><HeroProductVisual /></div>
      </div>
      <div className={styles.heroFooter} role="group" aria-label="What you can check before ordering">
        <span><b>01</b> Clearly identified materials</span>
        <span><b>02</b> Original batch reports</span>
        <span><b>03</b> Prices before checkout</span>
      </div>
    </section>
  );
}
