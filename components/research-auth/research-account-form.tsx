"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { RESEARCH_STATUSES, safeResearchReturnPath } from "@/lib/research-auth/qualification";
import styles from "./research-account.module.css";

export type ResearchFormMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password";
const titles: Record<ResearchFormMode, string> = { "sign-in": "Research-account sign-in.", "sign-up": "Create your research account.", "forgot-password": "Reset your password.", "reset-password": "Choose a new password." };

export function ResearchAccountForm({ mode, nextPath = "/", token = "" }: { mode: ResearchFormMode; nextPath?: string; token?: string }) {
  const [busy,setBusy] = useState(false), [error,setError] = useState<string | null>(null), [complete,setComplete] = useState(false);
  const signUp = mode === "sign-up", reset = mode === "reset-password", forgot = mode === "forgot-password";
  const returnTo = safeResearchReturnPath(nextPath);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true);setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim(), password = String(form.get("password") || "");
    const endpoint = signUp ? "sign-up/email" : forgot ? "request-password-reset" : reset ? "reset-password" : "sign-in/email";
    const payload = signUp ? { email, password, name: "Research account", researchStatus: form.get("researchStatus"),
      ageConfirmed: form.get("ageConfirmed") === "on", researchUseConfirmed: form.get("researchUseConfirmed") === "on" }
      : forgot ? { email, redirectTo: `${window.location.origin}/research-account/reset-password` }
      : reset ? { token, newPassword: password } : { email, password };
    try {
      const response = await fetch(`/api/research-auth/${endpoint}`, { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "We could not complete that request. Please try again.");
      if (forgot || reset) { setComplete(true);setBusy(false);return; }
      // A complete new document prevents a former account/password page from
      // carrying authentication fields into storefront analytics or ad scripts.
      window.location.assign(returnTo);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Please try again.");setBusy(false); }
  }

  return <main className={styles.formWrap}><p className={styles.eyebrow}>PSL Labs / Research access</p><h1 className={styles.title}>{titles[mode]}</h1>
    <p className={styles.intro}>{signUp ? "Registration is free and access starts immediately. State your intended laboratory use to create an account." : forgot ? "Enter your account email. If an account exists, we will send a one-time password-reset link." : reset ? "Use a new password with at least 12 characters. Resetting it signs out your existing sessions." : "Sign in to browse laboratory-research materials and batch documentation."}</p>
    {complete ? <div className={`${styles.notice} ${styles.success}`} role="status" style={{ marginTop: 24 }}>{forgot ? "If that email has an account, a reset link has been requested. Check your inbox and spam folder." : "Your password has been reset. Sign in with your new password."}</div> : <form className={styles.form} onSubmit={submit}>
      {!reset && <label className={styles.field}>Email<input className={styles.input} type="email" name="email" required autoComplete="email" maxLength={254} disabled={busy} /></label>}
      {!forgot && <label className={styles.field}>Password<input className={styles.input} type="password" name="password" required minLength={signUp || reset ? 12 : undefined} maxLength={128} autoComplete={signUp || reset ? "new-password" : "current-password"} disabled={busy} />{(signUp || reset) && <span className={styles.hint}>Use at least 12 characters. A unique passphrase works well.</span>}</label>}
      {signUp && <><label className={styles.field}>Research status<select className={styles.input} name="researchStatus" required defaultValue="" disabled={busy}><option value="" disabled>Select your research status</option>{RESEARCH_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select><span className={styles.hint}>Your stated role and intended use; this does not verify credentials.</span></label>
        <div className={styles.declarations}><label className={styles.declaration}><input type="checkbox" name="ageConfirmed" required disabled={busy} /><span>I am at least 21 years old and permitted to acquire and handle materials for legitimate laboratory research.</span></label>
        <label className={styles.declaration}><input type="checkbox" name="researchUseConfirmed" required disabled={busy} /><span>I confirm these materials are for laboratory research only, not for human or animal consumption or use. I agree to the <Link href="/terms" target="_blank">Terms of Service</Link> and acknowledge the <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span></label></div></>}
      {error && <p className={styles.notice} role="alert">{error}</p>}
      {reset && !token && <p className={styles.notice} role="alert">This reset link is missing its token. Request a new link.</p>}
      <button className={styles.button} type="submit" disabled={busy || (reset && !token)}>{busy ? "Please wait…" : signUp ? "Create free account" : forgot ? "Send reset link" : reset ? "Save new password" : "Sign in"}</button>
    </form>}
    <div className={styles.links}>{mode === "sign-in" ? <><Link href={`/research-account/sign-up?next=${encodeURIComponent(returnTo)}`}>Create a free account</Link><Link href="/research-account/forgot-password">Forgot password?</Link></> : <Link href={`/research-account/sign-in?next=${encodeURIComponent(returnTo)}`}>Back to sign in</Link>}</div>
    <p className={styles.scope}>Account registration does not subscribe you to marketing or allow advertising cookies. Optional cookie choices remain separate.</p>
  </main>;
}
