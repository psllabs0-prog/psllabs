"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { createPreviewPartner, PartnerPreviewNotice, type PartnerRegistration } from "./partner-preview";
import styles from "./partner-program.module.css";

export function PartnerApplicationForm({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const received = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [preferredCode, setPreferredCode] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<"zelle" | "arrange">("zelle");
  const [pending, setPending] = useState<PartnerRegistration | null>(null);
  useEffect(() => { if (status === "sent") received.current?.focus(); }, [status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending" || !form.current?.reportValidity()) return;
    const fields = new FormData(form.current);
    const input: PartnerRegistration = { name: String(fields.get("name") ?? "").trim(), email: String(fields.get("email") ?? "").trim(), preferredCode: preferredCode.trim(), payoutMethod, payoutContact: String(fields.get("payoutContact") ?? "").trim() };
    setError(null); setStatus("sending");
    if (preview) { setPending(input); setStatus("sent"); return; }
    try {
      const response = await fetch("/api/partners/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, acceptTerms: fields.get("acceptTerms") === "on", websiteUrl: fields.get("websiteUrl") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "We couldn’t create your account. Please try again.");
      setStatus("sent");
    } catch (failure) { setStatus("idle"); setError(failure instanceof Error ? failure.message : "We couldn’t create your account. Please try again."); }
  }
  function simulateVerification() {
    if (!pending) return;
    try { createPreviewPartner(pending); router.push("/partners/account"); }
    catch { setError("The preview needs browser session storage. Enable it or open the example dashboard directly."); }
  }
  if (status === "sent") return <><div ref={received} className={styles.success} role="status" tabIndex={-1}><MailCheck size={30} strokeWidth={1.5} aria-hidden /><h2>{preview ? "Preview registration received." : "Check your email."}</h2><p>{preview ? "No email was sent. Use the button below to simulate email verification and see your code and example dashboard." : "If this email is eligible, a secure verification link will arrive shortly. Verify your email to activate your partner account and receive your code."}</p>{preview ? <button type="button" className={styles.primary} onClick={simulateVerification}>Simulate email verification <ArrowRight size={16} aria-hidden /></button> : <p><Link href="/partners/account">Go to partner sign-in</Link></p>}</div>{error ? <p className={styles.error} role="alert">{error}</p> : null}</>;
  return <>{preview ? <PartnerPreviewNotice>Use a made-up email to try the form.</PartnerPreviewNotice> : null}<div className={styles.registrationCard}><form ref={form} onSubmit={submit} className={styles.form} aria-label="Create partner account">
    <div><label htmlFor="partner-name">Your name or organization</label><input id="partner-name" name="name" autoComplete="name" required maxLength={120} placeholder="Your name" /></div>
    <div><label htmlFor="partner-email">Account email</label><input id="partner-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /><p className={styles.fieldHelp}>You’ll sign in with a secure email link. No password needed.</p></div>
    <div><label htmlFor="partner-payout-method">Payout method</label><select id="partner-payout-method" name="payoutMethod" value={payoutMethod} onChange={event => setPayoutMethod(event.target.value as "zelle" | "arrange")}><option value="zelle">Zelle — manual monthly payment</option><option value="arrange">Arrange another method with PSL</option></select><p className={styles.fieldHelp}>Customer checkout is separate: your code works with card and Bitcoin orders.</p></div>
    {payoutMethod === "zelle" ? <div><label htmlFor="partner-payout-contact">Zelle email or phone</label><input id="partner-payout-contact" name="payoutContact" type="text" autoComplete="off" required maxLength={254} placeholder="Email or phone linked to Zelle" /><p className={styles.fieldHelp}>For manual payouts only. Do not enter bank account or card numbers.</p></div> : null}
    <div><label htmlFor="partner-code">Your referral code <span className={styles.muted}>(optional)</span></label><input id="partner-code" name="preferredCode" value={preferredCode} onChange={event => setPreferredCode(event.target.value.toUpperCase())} pattern="[A-Za-z0-9]{3,24}" maxLength={24} autoComplete="off" spellCheck={false} placeholder="E.G. ALEX10" aria-describedby="partner-code-help" /><p id="partner-code-help" className={styles.fieldHelp}>{preferredCode ? `Requested link: psllabs.org/r/${preferredCode.toLowerCase()}` : "Choose 3–24 letters or numbers, or leave blank for an automatic code."} Availability is confirmed at registration.</p></div>
    <div className={styles.hidden} aria-hidden="true"><label htmlFor="partner-website-url">Leave this blank</label><input id="partner-website-url" name="websiteUrl" tabIndex={-1} autoComplete="off" /></div>
    <label className={styles.check}><input type="checkbox" name="acceptTerms" required /><span>I agree to the <Link href="/partners/terms">partner program terms</Link>, including laboratory-only promotion, accurate information, clear commission disclosure and monthly manual payout rules.</span></label>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <button className={styles.primary} type="submit" disabled={status === "sending"}>{status === "sending" ? "Creating your account…" : "Create partner account"}<ArrowRight size={16} aria-hidden /></button>
    <p className={styles.formFooter}>Already a partner? <Link href="/partners/account">Sign in</Link>.<br />Joining does not subscribe you to marketing emails. <Link href="/privacy#partners">Privacy information</Link>.</p>
  </form></div></>;
}
