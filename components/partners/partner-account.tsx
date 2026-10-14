"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Copy, PackageSearch, ReceiptText } from "lucide-react";
import { PartnerEnrollmentForm } from "./partner-enrollment-form";
import { PSLLogo } from "@/components/branding/psl-logo";
import { clearPreviewPartner, getPreviewDashboard, PartnerPreviewNotice, recordPreviewPayout, type PartnerDashboard } from "./partner-preview";
import styles from "./partner-program.module.css";

const dollars = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const date = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
const statusLabel = (status: string) => status === "payable" ? "Ready for payout" : status === "held" ? "Held for review" : status === "paid" ? "Paid" : status === "ineligible" ? "Not eligible" : status;

export function PartnerAccount({ preview = false }: { preview?: boolean }) {
  const signInEmail = useRef<HTMLInputElement>(null);
  const focusSignInAfterLogout = useRef(false);
  const [account, setAccount] = useState<PartnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => { if (!account && !loading && focusSignInAfterLogout.current) { focusSignInAfterLogout.current = false; signInEmail.current?.focus(); } }, [account, loading]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (preview) { setAccount(getPreviewDashboard()); return; }
        const response = await fetch("/api/partners/account", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) return;
        if (!response.ok) throw new Error("Your account is temporarily unavailable. Please try again.");
        setAccount(await response.json());
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Your account is temporarily unavailable."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [preview]);
  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending) return;
    const form = event.currentTarget; if (!form.reportValidity()) return;
    const values = new FormData(form); setError(null); setNotice(null); setSending(true);
    try {
      if (preview) { setAccount(getPreviewDashboard()); setNotice("Preview sign-in simulated. No email was sent."); return; }
      const response = await fetch("/api/partners/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: values.get("email"), websiteUrl: values.get("websiteUrl") }) });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Sign-in is temporarily unavailable. Please try again.");
      setNotice("If we have an account for this email, a sign-in link will arrive shortly. The link expires after 15 minutes.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Please try again."); }
    finally { setSending(false); }
  }
  async function signOut() {
    if (sending) return; setSending(true); setError(null);
    try {
      if (preview) clearPreviewPartner();
      else { const response = await fetch("/api/partners/auth/logout", { method: "POST" }); if (!response.ok) throw new Error("Sign-out could not be confirmed. Please try again."); }
      focusSignInAfterLogout.current = true; setAccount(null); setNotice(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Please try again."); }
    finally { setSending(false); }
  }
  async function reloadAccount() {
    const response = await fetch("/api/partners/account", { cache: "no-store" });
    if (!response.ok) throw new Error("Enrollment was saved, but your dashboard could not reload. Refresh this page.");
    setAccount(await response.json()); setNotice("Current program terms accepted. Your account has been updated.");
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setNotice(`${label} copied.`); }
    catch { setError("Copying is unavailable in this browser. Select and copy the code or link directly."); }
  }
  function simulatePayout() {
    try { recordPreviewPayout(); setAccount(getPreviewDashboard()); setNotice("Sample payout recorded in this preview only. No money was transferred."); }
    catch { setError("Preview session storage is unavailable."); }
  }
  const legacyTerms = !preview && account?.partner.terms !== null && typeof account?.partner.terms === "object" && "version" in account.partner.terms && account.partner.terms.version === "psl-referral-pilot-v1";
  const needsEnrollment = !preview && account && !["paused", "declined"].includes(account.partner.status) && (legacyTerms || !account.partner.code);
  return <main className={`storefront-theme ${styles.privatePage}`}><div className={styles.account}>
    <header className={styles.accountHeader}><Link href="/" aria-label="PSL Labs home"><PSLLogo height={36} decorative /></Link><nav className={styles.inlineActions} aria-label="Partner account navigation"><Link href="/partners">Program overview</Link>{account ? <button type="button" className={styles.secondary} onClick={signOut} disabled={sending}>Sign out</button> : <Link href="/partners/register">Create account</Link>}</nav></header>
    {preview ? <PartnerPreviewNotice>All order amounts and payout records below are synthetic examples.</PartnerPreviewNotice> : null}
    {loading ? <p className={styles.loading} role="status">Loading your partner account…</p> : account ? <>
      <div className={styles.dashboardIntro}><div><p className={styles.kicker}>Your partner dashboard</p><h1 className={styles.accountTitle}>{account.partner.name}</h1><p className={styles.muted}>{account.partner.code ? "Your code, your referrals, and a clear record of every eligible commission." : account.partner.status === "paused" ? "Your partnership is paused. Contact support with questions." : account.partner.status === "declined" ? "Your partnership is inactive. Contact support if you have questions." : "Verify your email and accepted program terms to activate your referral code."}</p></div>{account.partner.code ? <span className={styles.statusBadge}>{preview ? "Preview account" : "Active partner"}</span> : null}</div>
      {account.partner.code ? <section className={styles.sharing} aria-label="Your referral code and link"><div><p className={styles.summaryLabel}>Your referral code</p><div className={styles.codeRow}><span className={styles.codeValue}>{account.partner.code.toUpperCase()}</span><button type="button" className={styles.copyButton} onClick={() => copy(account.partner.code!, "Referral code")} aria-label="Copy referral code">{copied === "Referral code" ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}Copy</button></div></div><div><p className={styles.summaryLabel}>Your referral link</p><div className={styles.codeRow}><p className={styles.linkValue}>{preview ? `Preview link: psllabs.org${account.partner.trackingUrl}` : account.partner.trackingUrl}</p>{account.partner.trackingUrl ? <button type="button" className={styles.copyButton} onClick={() => copy(preview ? `${window.location.origin}${account.partner.trackingUrl}` : account.partner.trackingUrl!, "Referral link")} aria-label="Copy referral link">{copied === "Referral link" ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}</button> : null}</div></div><p className={styles.sharingFoot}>{legacyTerms ? "Your account uses the earlier first-order Bitcoin referral terms. Existing commissions keep their recorded terms. Contact PSL to move to the updated program." : "Earn 10% on eligible orders using your code. New customers get 10% off their first eligible order with card or Bitcoin checkout."} Clearly disclose your commission relationship when sharing. <Link href="/partners/terms">Program terms</Link>.</p></section> : null}
      {needsEnrollment ? <PartnerEnrollmentForm onEnrolled={reloadAccount} /> : null}
      <section className={styles.stats} aria-label="Your referral summary"><div><span className={styles.summaryLabel}>Eligible orders</span><strong>{account.summary.eligibleOrders}</strong></div><div><span className={styles.summaryLabel}>Held for review</span><strong>{dollars(account.summary.heldCommission)}</strong></div><div><span className={styles.summaryLabel}>Ready for payout</span><strong>{dollars(account.summary.payableCommission)}</strong></div><div><span className={styles.summaryLabel}>Paid to date</span><strong>{dollars(account.summary.paidCommission ?? account.commissions.filter(row => row.status === "paid").reduce((total, row) => total + row.amount, 0))}</strong></div></section>
      <div className={styles.sectionHeading}><h2>Referral orders</h2><p>Select an order to see its items and commission.</p></div>
      {account.commissions.length ? <div className={styles.orders}>{account.commissions.map(row => <details className={styles.order} key={row.reference}><summary><div><span className={styles.orderReference}>{row.reference}</span><span className={styles.orderDate}>{date(row.createdAt)}{row.customerReference ? ` · ${row.customerReference}` : ""}</span></div><div className={styles.orderMetric}><span className={styles.orderMoney}>{dollars(row.eligibleProductSubtotal)}</span><small>Eligible merchandise</small></div><div className={styles.orderMetric}><span className={`${styles.orderMoney} ${styles.commissionMoney}`}>{dollars(row.amount)}</span><small>Your commission</small></div><div className={styles.orderStatus}><span>{statusLabel(row.status)}</span><ChevronDown size={16} aria-hidden /></div></summary><div className={styles.orderDetail}><div className={styles.orderDetailGrid}><div><p className={styles.summaryLabel}>Products ordered</p>{row.items?.length ? <ul className={styles.itemList}>{row.items.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}</span><span>Qty {item.quantity}</span></li>)}</ul> : <p className={styles.muted}>Item details are unavailable for this record.</p>}</div><div><p className={styles.summaryLabel}>Commission details</p><dl className={styles.detailList}><dt>Payment method</dt><dd>{row.paymentMethod === "card" ? "Card" : row.paymentMethod === "bitcoin" ? "Bitcoin" : "Not provided"}</dd><dt>Commission rate</dt><dd>10%</dd><dt>Currency</dt><dd>{row.currency ?? "USD"}</dd>{row.payableAfter ? <><dt>Hold ends</dt><dd>{date(row.payableAfter)}</dd></> : null}{row.paidAt ? <><dt>Payout recorded</dt><dd>{date(row.paidAt)}</dd></> : null}</dl></div></div><p className={styles.reason}>{row.reason}</p></div></details>)}</div> : <div className={styles.empty}><PackageSearch size={30} strokeWidth={1.5} aria-hidden /><h3>Your referrals will appear here.</h3><p>Once an eligible order uses your active code, its items and commission status appear in this dashboard.</p></div>}
      <div className={styles.sectionHeading}><h2>Payout history</h2><p>Payments are made manually and recorded by PSL.</p></div>
      {account.payouts?.length ? <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">Your recorded manual payouts in U.S. dollars</caption><thead><tr><th>Reference</th><th>Period</th><th>Paid on</th><th>Amount</th><th>Method</th></tr></thead><tbody>{account.payouts.map(payout => <tr key={payout.reference}><td data-label="Reference">{payout.reference}</td><td data-label="Period">{payout.period}</td><td data-label="Paid on">{date(payout.paidAt)}</td><td data-label="Amount">{dollars(payout.amount)}</td><td data-label="Method">{payout.method}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><ReceiptText size={28} strokeWidth={1.5} aria-hidden /><h3>No payouts recorded yet.</h3><p>Completed manual payouts will appear here. A payable balance alone does not mean money has been sent.</p></div>}
      {preview ? <div className={styles.previewTools}><button type="button" className={styles.secondary} onClick={simulatePayout} disabled={account.summary.payableCommission === 0}>Simulate recording a payout</button><p>This previews PSL’s manual payout workflow; it cannot transfer funds.</p></div> : null}
      <p className={styles.scope}>Commissions require verified payment, confirmed delivery, a 30-day review period and refund/fraud checks. Your dashboard excludes customer addresses, contact information and payment credentials.</p>
    </> : <section className={styles.login}><p className={styles.kicker}>Your partner account</p><h1>Welcome back.</h1><p className={styles.lead}>Enter your account email for a secure, one-time sign-in link. No password needed.</p><form className={styles.form} onSubmit={requestLink}><div><label htmlFor="partner-signin-email">Account email</label><input ref={signInEmail} id="partner-signin-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" /></div><div className={styles.hidden} aria-hidden="true"><label htmlFor="signin-honeypot">Leave this blank</label><input id="signin-honeypot" name="websiteUrl" autoComplete="off" tabIndex={-1} /></div><button type="submit" className={styles.primary} disabled={sending}>{sending ? "Requesting link…" : "Email me a sign-in link"}</button></form><p className={styles.muted}>New to the program? <Link href="/partners/register">Create your account</Link>.</p></section>}
    {notice ? <p className={styles.success} role="status">{notice}</p> : null}{error ? <p className={styles.error} role="alert">{error}</p> : null}
    <p className={styles.scope}>Your account is private. <Link href="/privacy#partners">Privacy policy</Link> · <a href="mailto:support@psllabs.org">Contact support</a></p>
  </div></main>;
}
