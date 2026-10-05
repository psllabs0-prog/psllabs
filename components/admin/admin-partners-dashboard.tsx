"use client";

import { useCallback, useEffect, useState } from "react";
import type { Partner, PartnerStatus, PartnersDashboard } from "@/lib/partners/types";

const STATUS_LABELS: Record<PartnerStatus, string> = {
  prospect: "Prospect",
  awaiting_reply: "Awaiting reply",
  reviewing: "Reviewing",
  active: "Active",
  paused: "Paused",
  declined: "Declined",
};

const fieldClass =
  "min-h-11 w-full rounded-lg border border-linen bg-page px-3 py-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-linen px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function dateLabel(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function isFollowUpDue(partner: Partner) {
  return (
    !["paused", "declined"].includes(partner.status) &&
    partner.followUpDueAt !== null &&
    new Date(partner.followUpDueAt).getTime() <= Date.now()
  );
}

async function requestDashboard(signal?: AbortSignal): Promise<PartnersDashboard> {
  const response = await fetch("/api/admin/partners", { cache: "no-store", signal });
  if (response.status === 401) {
    throw new Error("Your session has expired. Reload this page to sign in again.");
  }
  if (response.status === 503) {
    throw new Error("The partner workspace is not ready yet. Please try again after setup is complete.");
  }
  if (!response.ok) throw new Error("Could not load partners. Please try again.");
  return response.json() as Promise<PartnersDashboard>;
}

export function AdminPartnersDashboard() {
  const [data, setData] = useState<PartnersDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "due" | PartnerStatus>("all");

  const refresh = useCallback((signal?: AbortSignal) => {
    return requestDashboard(signal).then((dashboard) => {
      if (!signal?.aborted) {
        setData(dashboard);
        setError(null);
      }
    }).catch((cause: unknown) => {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Could not load partners.");
    }).finally(() => {
      if (!signal?.aborted) setLoading(false);
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  async function save(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/partners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PSL-Partners-Action": "1",
        },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        throw new Error("Your session has expired. Reload this page to sign in again.");
      }
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || "Could not save the change. Please try again.");
      }
      setMessage(success);
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the change.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
      setMessage(`${label} copied.`);
    } catch {
      setError("Clipboard access was unavailable. Select the text and copy it manually.");
    }
  }

  async function createPartner(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const saved = await save(
      {
        action: "create",
        businessName: fields.get("businessName"),
        contactName: fields.get("contactName"),
        email: fields.get("email"),
        website: fields.get("website"),
        source: fields.get("source"),
        destination: fields.get("destination"),
        notes: fields.get("notes"),
      },
      "Partner added. Tracking link and outreach drafts are ready for review."
    );
    if (saved) form.reset();
  }

  const partners = data?.partners.filter((partner) => {
    const matchesStatus =
      filter === "all" ||
      (filter === "due" ? isFollowUpDue(partner) : partner.status === filter);
    const query = search.trim().toLowerCase();
    return (
      matchesStatus &&
      `${partner.businessName} ${partner.contactName} ${partner.email} ${partner.code}`
        .toLowerCase()
        .includes(query)
    );
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-widest text-ash">Acquisition</p>
          <h1 className="mt-2 font-display text-display-lg font-bold text-ink">
            Partner workspace
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ash">
            Keep prospects, outreach drafts, follow-ups, and referred orders in one place.
            Review drafts here, then send through your email account.
          </p>
        </div>
        <button type="button" className={buttonClass} disabled={loading || busy} onClick={() => {
          setLoading(true);
          setError(null);
          void refresh();
        }}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-signal/30 p-4 text-sm text-signal">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-linen p-4 text-sm text-ink">{message}</p>}
      {loading && !data && <p role="status" className="text-sm text-ash">Loading partners…</p>}
      {data?.available && (
        <>
          <section aria-label="Partner summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["Partners", data.summary.partners],
              ["Active", data.summary.active],
              ["Follow-ups due", data.summary.followUpsDue],
              ["Paid referral orders", data.summary.paidOrders],
              ["Paid order total", money(data.summary.paidOrderRevenueUsd)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl border border-linen bg-surface p-4">
                <p className="text-xs text-ash">{label}</p>
                <p className="mt-2 break-words font-mono text-xl font-medium text-ink">{value}</p>
              </div>
            ))}
          </section>
          <p className="text-sm text-ash">
            Tracking codes do not change prices. Sales shown are referrals, not commissions owed.
            Paid order totals include shipping and are before fees and refunds.
            Outreach drafts are generated here for review; changing a partner’s status does not send an email.
          </p>

          <details className="rounded-xl border border-linen bg-surface p-5" open={data.partners.length === 0}>
            <summary className="cursor-pointer text-base font-semibold text-ink">Add a partner</summary>
            <form onSubmit={(event) => void createPartner(event)} className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm text-ink">
                <span>Business or channel name</span>
                <input className={fieldClass} name="businessName" required maxLength={120} disabled={busy} />
              </label>
              <label className="space-y-1.5 text-sm text-ink">
                <span>Contact name</span>
                <input className={fieldClass} name="contactName" maxLength={80} disabled={busy} />
              </label>
              <label className="space-y-1.5 text-sm text-ink">
                <span>Contact email</span>
                <input className={fieldClass} name="email" type="email" required maxLength={254} disabled={busy} />
              </label>
              <label className="space-y-1.5 text-sm text-ink">
                <span>Website or profile URL</span>
                <input className={fieldClass} name="website" type="url" placeholder="https://" maxLength={300} disabled={busy} />
              </label>
              <label className="space-y-1.5 text-sm text-ink">
                <span>How you found them</span>
                <input className={fieldClass} name="source" placeholder="Website inquiry, email, or profile" maxLength={300} disabled={busy} />
              </label>
              <label className="space-y-1.5 text-sm text-ink">
                <span>Destination on PSL Labs</span>
                <input className={fieldClass} name="destination" defaultValue="/products" required maxLength={500} disabled={busy} aria-describedby="partner-destination-help" />
                <span id="partner-destination-help" className="block text-xs text-ash">The site page visitors reach, such as /products.</span>
              </label>
              <label className="space-y-1.5 text-sm text-ink sm:col-span-2">
                <span>Private notes</span>
                <textarea aria-label="Private notes" className={fieldClass} name="notes" rows={3} maxLength={2000} disabled={busy} placeholder="Audience, fit, proposed terms, and questions to review" />
              </label>
              <div className="sm:col-span-2">
                <button type="submit" disabled={busy} className={`${buttonClass} bg-ink text-page hover:bg-ink/90`}>
                  {busy ? "Saving…" : "Create partner and drafts"}
                </button>
              </div>
            </form>
          </details>

          <section aria-labelledby="partners-heading" className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 id="partners-heading" className="font-display text-xl font-semibold text-ink">Partners</h2>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <label className="space-y-1 text-xs text-ash">
                  <span>Search partners</span>
                  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className={fieldClass} placeholder="Name, email, or code" />
                </label>
                <label className="space-y-1 text-xs text-ash">
                  <span>Show</span>
                  <select aria-label="Show" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className={fieldClass}>
                    <option value="all">All partners</option>
                    <option value="due">Follow-ups due</option>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {partners?.length === 0 && (
              <p className="rounded-xl border border-dashed border-linen p-6 text-sm text-ash">
                {data.partners.length === 0 ? "Add your first partner to generate a tracking link and outreach drafts." : "No partners match this search."}
              </p>
            )}

            {partners?.map((partner) => (
              <article key={partner.id} className="min-w-0 space-y-5 rounded-xl border border-linen bg-surface p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="break-words font-display text-lg font-semibold text-ink">{partner.businessName}</h3>
                    <p className="mt-1 break-words text-sm text-ash">{[partner.contactName, partner.email].filter(Boolean).join(" · ")}</p>
                    {partner.website && <p className="mt-1 break-all text-xs text-ash">{partner.website}</p>}
                    {isFollowUpDue(partner) && <p className="mt-2 text-sm font-medium text-ink">Follow-up due · {dateLabel(partner.followUpDueAt)}</p>}
                  </div>
                  <label className="space-y-1 text-xs text-ash">
                    <span>Status</span>
                    <select aria-label={`Status for ${partner.businessName}`} className={fieldClass} value={partner.status} disabled={busy} onChange={(event) => void save({ action: "update", id: partner.id, status: event.target.value }, "Partner status updated.")}>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 text-sm sm:grid-cols-3">
                  <p className="text-ash">Referral code <span className="block break-all font-mono text-ink">{partner.code}</span></p>
                  <p className="text-ash">Paid referral orders <span className="block font-mono text-ink">{partner.metrics.paidOrders}</span></p>
                  <p className="text-ash">Paid order total <span className="block font-mono text-ink">{money(partner.metrics.paidOrderRevenueUsd)}</span></p>
                </div>

                <div className="space-y-2">
                  <label htmlFor={`link-${partner.id}`} className="text-xs text-ash">Tracking link</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input id={`link-${partner.id}`} readOnly value={partner.trackingUrl} className={`${fieldClass} min-w-0 font-mono text-xs`} onFocus={(event) => event.target.select()} />
                    <button type="button" className={`${buttonClass} shrink-0`} onClick={() => void copy(partner.trackingUrl, "Tracking link")}>Copy link</button>
                  </div>
                  {partner.status !== "active" && <p className="text-xs text-ash">Confirm the partnership and set its status to Active before sharing this link.</p>}
                </div>

                <div className="grid gap-3 text-xs text-ash sm:grid-cols-3">
                  <p>Last contacted: {dateLabel(partner.lastContactedAt)}</p>
                  <p>Last reply: {dateLabel(partner.lastRepliedAt)}</p>
                  <p>Follow-up: {dateLabel(partner.followUpDueAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={buttonClass} disabled={busy || partner.status === "paused" || partner.status === "declined"} onClick={() => void save({ action: "mark_contacted", id: partner.id }, "Contact recorded. No email was sent by this workspace.")}>Record email sent</button>
                  <button type="button" className={buttonClass} disabled={busy} onClick={() => void save({ action: "mark_replied", id: partner.id }, "Reply recorded.")}>Record reply</button>
                  {partner.status !== "paused" && <button type="button" className={buttonClass} disabled={busy} onClick={() => void save({ action: "pause", id: partner.id }, "Partner paused.")}>Pause partner</button>}
                </div>

                <details className="border-t border-linen pt-4">
                  <summary className="cursor-pointer text-sm font-medium text-ink">Outreach drafts · unsent</summary>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {([
                      ["Qualification", partner.drafts.qualification],
                      ["Follow-up", partner.drafts.followUp],
                    ] as const).map(([label, draft]) => (
                      <div key={label} className="min-w-0 space-y-3 rounded-lg border border-linen p-4">
                        <h4 className="text-sm font-semibold text-ink">{label}</h4>
                        <p className="break-words text-sm text-ink"><span className="text-ash">Subject: </span>{draft.subject}</p>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ash">{draft.body}</p>
                        <button type="button" className={buttonClass} onClick={() => void copy(`Subject: ${draft.subject}\n\n${draft.body}`, `${label} draft`)}>Copy {label.toLowerCase()} draft</button>
                      </div>
                    ))}
                  </div>
                </details>

                <details className="border-t border-linen pt-4">
                  <summary className="cursor-pointer text-sm font-medium text-ink">Edit partner details</summary>
                  <form key={partner.updatedAt} className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
                    event.preventDefault();
                    const fields = new FormData(event.currentTarget);
                    void save({
                      action: "update",
                      id: partner.id,
                      businessName: fields.get("businessName"),
                      contactName: fields.get("contactName"),
                      email: fields.get("email"),
                      website: fields.get("website"),
                      source: fields.get("source"),
                      notes: fields.get("notes"),
                      destination: fields.get("destination"),
                    }, "Partner details saved.");
                  }}>
                    <label className="block space-y-1.5 text-sm text-ink">
                      <span>Business or channel name</span>
                      <input className={fieldClass} name="businessName" defaultValue={partner.businessName} required maxLength={120} disabled={busy} />
                    </label>
                    <label className="block space-y-1.5 text-sm text-ink">
                      <span>Contact name</span>
                      <input className={fieldClass} name="contactName" defaultValue={partner.contactName} maxLength={80} disabled={busy} />
                    </label>
                    <label className="block space-y-1.5 text-sm text-ink">
                      <span>Contact email</span>
                      <input className={fieldClass} name="email" type="email" defaultValue={partner.email} required maxLength={254} disabled={busy} />
                    </label>
                    <label className="block space-y-1.5 text-sm text-ink">
                      <span>Website or profile URL</span>
                      <input className={fieldClass} name="website" type="url" defaultValue={partner.website} maxLength={300} disabled={busy} />
                    </label>
                    <label className="block space-y-1.5 text-sm text-ink">
                      <span>How you found them</span>
                      <input className={fieldClass} name="source" defaultValue={partner.source} maxLength={300} disabled={busy} />
                    </label>
                    <label className="block space-y-1.5 text-sm text-ink">
                      <span>Destination on PSL Labs</span>
                      <input className={fieldClass} name="destination" defaultValue={partner.destination} required maxLength={500} disabled={busy} />
                    </label>
                    <label className="block space-y-1.5 text-sm text-ink sm:col-span-2">
                      <span>Private notes</span>
                      <textarea aria-label="Private notes" className={fieldClass} name="notes" defaultValue={partner.notes} rows={4} maxLength={2000} disabled={busy} />
                    </label>
                    <div className="sm:col-span-2"><button type="submit" className={buttonClass} disabled={busy}>Save details</button></div>
                  </form>
                </details>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
