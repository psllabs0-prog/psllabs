"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "./partner-program.module.css";

export function PartnerEnrollmentForm({ onEnrolled }: { onEnrolled: () => Promise<void> }) {
  const [payoutMethod, setPayoutMethod] = useState<"zelle" | "arrange">("zelle");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending || !event.currentTarget.reportValidity()) return;
    const fields = new FormData(event.currentTarget); setSending(true); setError(null);
    try {
      const response = await fetch("/api/partners/enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceptTerms: fields.get("acceptTerms") === "on", payoutMethod, payoutContact: fields.get("payoutContact") ?? "", websiteUrl: fields.get("websiteUrl") ?? "" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Enrollment could not be confirmed. Please try again.");
      await onEnrolled();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Enrollment could not be confirmed."); }
    finally { setSending(false); }
  }
  return <section className={styles.enrollment} aria-labelledby="partner-enrollment-heading"><p className={styles.kicker}>Current program</p><h2 id="partner-enrollment-heading">Join the current program.</h2><p className={styles.muted}>Accept the updated terms to use your code with card and Bitcoin checkout and earn 10% on eligible orders using it. Earlier commissions keep their recorded terms.</p><form className={styles.form} onSubmit={enroll}><div><label htmlFor="enroll-payout-method">Payout method</label><select id="enroll-payout-method" value={payoutMethod} onChange={event => setPayoutMethod(event.target.value as "zelle" | "arrange")}><option value="zelle">Zelle — manual monthly payment</option><option value="arrange">Arrange another method with PSL</option></select></div>{payoutMethod === "zelle" ? <div><label htmlFor="enroll-payout-contact">Zelle email or phone</label><input id="enroll-payout-contact" name="payoutContact" required maxLength={254} autoComplete="off" placeholder="Email or phone linked to Zelle" /><p className={styles.fieldHelp}>Do not enter bank account or card numbers.</p></div> : null}<div className={styles.hidden} aria-hidden="true"><label htmlFor="enroll-honeypot">Leave this blank</label><input id="enroll-honeypot" name="websiteUrl" tabIndex={-1} autoComplete="off" /></div><label className={styles.check}><input type="checkbox" name="acceptTerms" required /><span>I accept the <Link href="/partners/terms">current partner terms</Link>, including laboratory-only promotion, commission disclosures and monthly manual payouts.</span></label>{error ? <p className={styles.error} role="alert">{error}</p> : null}<button type="submit" className={styles.primary} disabled={sending}>{sending ? "Confirming enrollment…" : "Accept terms and join"}</button></form></section>;
}
