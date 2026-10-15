import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getResearchAccount } from "@/lib/research-auth/server";
import { RESEARCH_STATUSES } from "@/lib/research-auth/qualification";
import { ResearchAccountSignOut } from "@/components/research-auth/research-account-session";
import styles from "@/components/research-auth/research-account.module.css";

export const metadata = { title: "Your research account | PSL Labs", robots: { index: false, follow: false } };
export default async function ResearchAccountPage() {
  const account = await getResearchAccount(await headers());
  if (!account) redirect("/research-account/sign-in");
  return <main className={styles.formWrap}><p className={styles.eyebrow}>PSL Labs / Your account</p><h1 className={styles.title}>Research access.</h1>
    <p className={styles.intro}>Your account uses your stated research role and intended use. PSL has not verified professional credentials.</p>
    <div className={styles.accountRow}><span>Account email</span><strong>{account.email}</strong></div><div className={styles.accountRow}><span>Stated research status</span><strong>{RESEARCH_STATUSES.find(item => item.value === account.researchStatus)?.label}</strong></div>
    <div className={styles.accountActions}><Link className={styles.button} href="/">Continue to PSL Labs</Link><ResearchAccountSignOut /><Link href="/research-account/forgot-password">Reset password</Link></div>
  </main>;
}
