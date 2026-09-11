"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import type { CeoWeeklyBrief } from "@/lib/ceo-brief/types";

type Payload = {
  brief: CeoWeeklyBrief | null;
  row: {
    id: number;
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    emailSentAt: string | null;
  } | null;
};

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="premium-card px-5 py-4">
      <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
      <div className="mt-3 text-sm text-ink">{children}</div>
    </section>
  );
}

export function AdminCeoBriefDashboard() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/ceo-brief");
    if (!res.ok) {
      setError("Failed to load CEO brief.");
      return;
    }
    setData((await res.json()) as Payload);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function generate(sendEmail: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ceo-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", sendEmail }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        emailSent?: boolean;
        emailSkippedReason?: string;
        brief?: CeoWeeklyBrief;
        row?: Payload["row"];
      };
      if (!res.ok || json.ok === false) {
        setMessage(json.error ?? "Generate failed");
      } else {
        setData({ brief: json.brief ?? null, row: json.row ?? null });
        setMessage(
          json.emailSent
            ? "Brief generated and emailed."
            : json.emailSkippedReason
              ? `Brief generated. Email: ${json.emailSkippedReason}`
              : "Brief generated."
        );
      }
    } catch {
      setMessage("Generate failed");
    } finally {
      setBusy(false);
    }
  }

  const brief = data?.brief;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg font-bold text-ink">
            PSL Labs Weekly CEO Brief
          </h1>
          <p className="mt-2 text-sm text-ash">
            {brief
              ? `Period ${brief.periodLabel} · Generated ${new Date(brief.generatedAt).toLocaleString()}`
              : "No brief generated yet."}
            {data?.row?.emailSentAt
              ? ` · Emailed ${new Date(data.row.emailSentAt).toLocaleString()}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate(false)}
            className="rounded-pill bg-accent px-4 py-2 text-sm font-medium text-page disabled:opacity-50"
          >
            {busy ? "Working…" : "Generate current brief"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate(true)}
            className="rounded-pill border border-linen px-4 py-2 text-sm disabled:opacity-50"
          >
            Generate + email
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-ash">{message}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {!brief ? (
        <div className="premium-card px-5 py-8 text-sm text-ash">
          Generate a brief to see this week&apos;s operating picture.
        </div>
      ) : (
        <>
          <Section title="Executive Summary">
            <ul className="list-disc space-y-1 pl-5">
              {brief.executiveSummary.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Section>

          <Section title="Sales / Finance">
            <p>
              Legitimate orders: {brief.sales.legitimateOrders}
              {brief.sales.ordersChangeNote
                ? ` (${brief.sales.ordersChangeNote})`
                : ""}
            </p>
            <p>
              Gross revenue: {money(brief.sales.grossRevenueUsd)}
              {brief.sales.revenueChangeNote
                ? ` (${brief.sales.revenueChangeNote})`
                : ""}
            </p>
            <p>
              Net/business revenue:{" "}
              {brief.sales.netBusinessRevenueUsd == null
                ? "insufficient data"
                : money(brief.sales.netBusinessRevenueUsd)}
            </p>
            <p>
              Units sold: {brief.sales.unitsSold} · AOV:{" "}
              {money(brief.sales.aovUsd)}
            </p>
            {brief.sales.paymentMethodMix.length > 0 && (
              <p className="mt-2">
                Payment mix:{" "}
                {brief.sales.paymentMethodMix
                  .map(
                    (m) =>
                      `${m.method} ${m.orders} (${money(m.revenueUsd)})`
                  )
                  .join(" · ")}
              </p>
            )}
            {brief.sales.revenueBySku.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-ash">
                {brief.sales.revenueBySku.slice(0, 8).map((s) => (
                  <li key={`${s.handle}-${s.sku}`}>
                    {s.handle}: {s.units} u · {money(s.revenueUsd)}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-ash">{brief.sales.refundsNote}</p>
            {brief.sales.reconciliationWarnings.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-red-700">
                {brief.sales.reconciliationWarnings.map((w) => (
                  <li key={`${w.type}-${w.orderId}`}>
                    {w.type}: {w.message}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Acquisition">
            <p className="text-ash">{brief.acquisition.message}</p>
          </Section>

          <Section title="Inventory">
            <p>
              Sellable units (total): {brief.inventory.sellableUnitsTotal} ·
              Inbound/testing units (not sellable):{" "}
              {brief.inventory.inboundUnitsTotal}
            </p>
            <p className="text-ash">{brief.inventory.testingEconomicsNote}</p>
            {brief.inventory.lowStockAlerts.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {brief.inventory.lowStockAlerts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            {brief.inventory.reorderReviewSignals.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-ash">
                {brief.inventory.reorderReviewSignals.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Customer / Support">
            <p>
              Genuine volume: {brief.support.genuineCustomerMessages} (G
              {brief.support.green} / Y{brief.support.yellow} / R
              {brief.support.red})
            </p>
            <p>
              Unresolved escalations: {brief.support.unresolvedEscalations}
            </p>
            <p>
              Spam: {brief.support.spamSolicitations} · Vendor:{" "}
              {brief.support.vendorSolicitations}{" "}
              <span className="text-ash">(excluded from demand)</span>
            </p>
            {brief.support.topGenuineCategories.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {brief.support.topGenuineCategories.map((c) => (
                  <li key={c.category}>
                    {c.category}: {c.count}
                  </li>
                ))}
              </ul>
            )}
            {brief.support.recurringQuestionHints.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-ash">
                {brief.support.recurringQuestionHints.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="SEO / Authority">
            <p className="text-ash">{brief.seo.message}</p>
          </Section>

          <Section title="System Health">
            {brief.health.warnings.length === 0 ? (
              <p className="text-ash">No failures or meaningful warnings.</p>
            ) : (
              <ul className="list-disc pl-5 text-red-700">
                {brief.health.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Three Actions for Luke">
            {brief.actions.length === 0 ? (
              <p className="text-ash">
                No high-priority personal actions this week.
              </p>
            ) : (
              <ol className="list-decimal space-y-3 pl-5">
                {brief.actions.map((a) => (
                  <li key={a.rank}>
                    <p className="font-medium">{a.action}</p>
                    <p className="text-ash">{a.why}</p>
                    {a.urgency && (
                      <p className="text-xs uppercase tracking-wide text-accent">
                        {a.urgency}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
