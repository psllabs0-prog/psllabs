"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./partner-program.module.css";

export function PartnerApplicationForm() {
  const form = useRef<HTMLFormElement>(null);
  const received = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle"|"sending"|"sent">("idle");
  const [error, setError] = useState<string|null>(null);
  useEffect(() => {
    if (status === "sent") received.current?.focus();
  }, [status]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(status === "sending") return;
    if(!form.current?.reportValidity()) return;
    const fields = new FormData(form.current);
    setError(null);setStatus("sending");
    try {
      const response = await fetch("/api/partners/apply", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:fields.get("name"),email:fields.get("email"),website:fields.get("website"),audiencePurpose:fields.get("audiencePurpose"),acceptTerms:fields.get("acceptTerms")==="on",websiteUrl:fields.get("websiteUrl")})});
      const body = await response.json();
      if(!response.ok) throw new Error(typeof body.error === "string" ? body.error : "We couldn’t receive your application. Please try again.");
      setStatus("sent");
    } catch (failure) {setStatus("idle");setError(failure instanceof Error ? failure.message : "We couldn’t receive your application. Please try again.");}
  }
  if(status === "sent") return <div ref={received} className={styles.success} role="status" tabIndex={-1}><strong>Application received.</strong><p>We’ll review your audience and proposed content before issuing a referral code. You can check your application through <Link href="/partners/account">partner sign-in</Link>.</p></div>;
  return <form ref={form} onSubmit={submit} className={styles.form} aria-label="Partner application">
    <div><label htmlFor="partner-name">Your name or organization</label><input id="partner-name" name="name" autoComplete="name" required maxLength={120}/></div>
    <div><label htmlFor="partner-email">Email</label><input id="partner-email" name="email" type="email" autoComplete="email" required maxLength={254}/></div>
    <div><label htmlFor="partner-website">Website or public profile <span className={styles.muted}>(optional)</span></label><input id="partner-website" name="website" type="url" autoComplete="url" placeholder="https://" maxLength={300}/></div>
    <div><label htmlFor="partner-audience">Who would you refer, and what would you share?</label><textarea id="partner-audience" name="audiencePurpose" required minLength={20} maxLength={1500} placeholder="Describe your laboratory research audience and proposed content."/><p className={styles.muted}>Please leave out medical information and private details about other people.</p></div>
    <div className={styles.hidden} aria-hidden="true"><label htmlFor="partner-website-url">Leave this blank</label><input id="partner-website-url" name="websiteUrl" tabIndex={-1} autoComplete="off"/></div>
    <label className={styles.check}><input type="checkbox" name="acceptTerms" required/><span>I agree to the <Link href="/partners/terms">partner program terms</Link>, including laboratory-only promotion and clear commission disclosure. I understand applications require review.</span></label>
    <p className={styles.muted}>We use these details to review your application and manage your partner account. Applying does not subscribe you to marketing emails. <Link href="/privacy#partners">Privacy information</Link>.</p>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <button className={styles.primary} type="submit" disabled={status === "sending"}>{status === "sending" ? "Sending application…" : "Apply to join"}</button>
  </form>;
}
