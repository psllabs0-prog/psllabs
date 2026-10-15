import { FDA_RESEARCH_NOTICE, RESEARCH_USE_NOTICE } from "@/lib/content/research-use";
import styles from "./research-use-banner.module.css";

export function ResearchUseBanner() {
  return (
    <aside aria-label="Research-use and FDA notice" className={styles.banner}>
      <div className={styles.content}>
        <p className={styles.primary}>{RESEARCH_USE_NOTICE}</p>
        <p className={styles.secondary}>{FDA_RESEARCH_NOTICE}</p>
      </div>
    </aside>
  );
}
