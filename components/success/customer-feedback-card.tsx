"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { PillButton } from "@/components/ui/pill-button";
import {
  DISCOVERY_SOURCE_OPTIONS,
  OPEN_FEEDBACK_MAX_LENGTH,
  PURCHASE_DRIVER_OPTIONS,
  type DiscoverySourceValue,
  type PurchaseDriverValue,
} from "@/lib/customer-intelligence/constants";
import { trackPlausibleClientEvent } from "@/lib/plausible/client";

type FeedbackPhase =
  | "loading"
  | "form"
  | "thanks"
  | "skipped"
  | "hidden"
  | "error";

export function CustomerFeedbackCard({ orderId }: { orderId: string }) {
  const baseId = useId();
  const [phase, setPhase] = useState<FeedbackPhase>("loading");
  const [discoverySource, setDiscoverySource] =
    useState<DiscoverySourceValue | "">("");
  const [purchaseDrivers, setPurchaseDrivers] = useState<PurchaseDriverValue[]>(
    []
  );
  const [openFeedback, setOpenFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch(
          `/api/customer-feedback?orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" }
        );
        if (!active) return;
        if (!res.ok) {
          setPhase("hidden");
          return;
        }
        const data = (await res.json()) as {
          show?: boolean;
          recorded?: "submitted" | "skipped" | null;
        };
        if (!data.show) {
          setPhase("hidden");
          return;
        }
        setPhase("form");
        trackPlausibleClientEvent("customer_feedback_viewed");
      } catch {
        if (active) setPhase("hidden");
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [orderId]);

  const toggleDriver = useCallback((value: PurchaseDriverValue) => {
    setPurchaseDrivers((prev) => {
      if (prev.includes(value)) {
        return prev.filter((v) => v !== value);
      }
      if (prev.length >= 2) {
        return prev;
      }
      return [...prev, value];
    });
  }, []);

  async function postFeedback(action: "submit" | "skip") {
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/customer-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          action,
          discoverySource: discoverySource || null,
          purchaseDrivers,
          openFeedback,
          website: honeypot,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        alreadyRecorded?: boolean;
      };

      if (!res.ok || !data.ok) {
        setErrorMessage(
          data.error ??
            "We couldn't save that feedback. Your order is already confirmed."
        );
        setPhase("error");
        return;
      }

      if (action === "skip") {
        trackPlausibleClientEvent("customer_feedback_skipped");
        setPhase("skipped");
      } else {
        trackPlausibleClientEvent("customer_feedback_submitted");
        setPhase("thanks");
      }
    } catch {
      setErrorMessage(
        "We couldn't save that feedback. Your order is already confirmed."
      );
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading" || phase === "hidden") {
    return null;
  }

  if (phase === "thanks") {
    return (
      <div className="premium-card mt-8 p-5 md:p-6" role="status">
        <p className="text-sm text-ash">Thanks — this helps.</p>
      </div>
    );
  }

  if (phase === "skipped") {
    return (
      <div className="premium-card mt-8 p-5 md:p-6" role="status">
        <p className="text-sm text-ash">No problem.</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="premium-card mt-8 p-5 md:p-6" role="status">
        <p className="text-sm text-ash">
          {errorMessage ??
            "We couldn't save that feedback. Your order is already confirmed."}
        </p>
      </div>
    );
  }

  const driversAtLimit = purchaseDrivers.length >= 2;

  return (
    <section
      className="premium-card mt-8 p-5 md:p-6"
      aria-labelledby={`${baseId}-heading`}
    >
      <h2
        id={`${baseId}-heading`}
        className="font-display text-lg font-bold text-ink md:text-xl"
      >
        Help us make PSL Labs easier to use
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ash">
        We&apos;re a new company, and a quick answer helps us improve.
        Completely optional.
      </p>

      <form
        className="mt-6 flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          void postFeedback("submit");
        }}
      >
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
          className="absolute left-[-9999px] h-px w-px opacity-0"
          aria-hidden
        />

        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium text-ink">
            How did you first hear about PSL Labs?
          </legend>
          <div className="flex flex-col gap-2">
            {DISCOVERY_SOURCE_OPTIONS.map((option) => {
              const optionId = `${baseId}-discovery-${option.value}`;
              return (
                <label
                  key={option.value}
                  htmlFor={optionId}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-linen bg-paper px-3 py-2.5 text-sm text-ink transition-colors hover:border-border-strong"
                >
                  <input
                    id={optionId}
                    type="radio"
                    name="discoverySource"
                    value={option.value}
                    checked={discoverySource === option.value}
                    onChange={() => setDiscoverySource(option.value)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent,#2FB6E0)]"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium text-ink">
            What mattered most when deciding to order?
          </legend>
          <p id={`${baseId}-drivers-hint`} className="text-xs text-ash">
            Choose up to 2. Optional.
          </p>
          <div
            className="flex flex-col gap-2"
            role="group"
            aria-describedby={`${baseId}-drivers-hint`}
          >
            {PURCHASE_DRIVER_OPTIONS.map((option) => {
              const optionId = `${baseId}-driver-${option.value}`;
              const checked = purchaseDrivers.includes(option.value);
              const disabled = driversAtLimit && !checked;
              return (
                <label
                  key={option.value}
                  htmlFor={optionId}
                  className={`flex items-start gap-3 rounded-lg border border-linen bg-paper px-3 py-2.5 text-sm text-ink transition-colors ${
                    disabled
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer hover:border-border-strong"
                  }`}
                >
                  <input
                    id={optionId}
                    type="checkbox"
                    name="purchaseDrivers"
                    value={option.value}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleDriver(option.value)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent,#2FB6E0)]"
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label
            htmlFor={`${baseId}-open`}
            className="font-medium text-ink"
          >
            Was anything unclear or did anything almost stop you from ordering?
          </label>
          <p id={`${baseId}-open-hint`} className="text-xs text-ash">
            Optional — anything we could make clearer or easier?
          </p>
          <textarea
            id={`${baseId}-open`}
            name="openFeedback"
            value={openFeedback}
            onChange={(event) =>
              setOpenFeedback(
                event.target.value.slice(0, OPEN_FEEDBACK_MAX_LENGTH)
              )
            }
            maxLength={OPEN_FEEDBACK_MAX_LENGTH}
            rows={4}
            aria-describedby={`${baseId}-open-hint ${baseId}-open-count`}
            className="w-full resize-y rounded-lg border border-linen bg-paper px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-stone focus:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            placeholder="Optional"
          />
          <p id={`${baseId}-open-count`} className="text-xs text-stone">
            {openFeedback.length}/{OPEN_FEEDBACK_MAX_LENGTH}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <PillButton type="submit" size="sm" disabled={busy}>
            {busy ? "Sending…" : "Send feedback"}
          </PillButton>
          <PillButton
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void postFeedback("skip")}
          >
            Skip
          </PillButton>
        </div>
      </form>
    </section>
  );
}
