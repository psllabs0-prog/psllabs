"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type State =
  | "loading"
  | "missing"
  | "ready"
  | "submitting"
  | "confirmed_sent"
  | "confirmed_simulated"
  | "confirmed_pending"
  | "already_confirmed"
  | "invalid"
  | "unavailable";

const MESSAGES: Partial<Record<State, string>> = {
  missing: "Open this page from the confirmation link in your email.",
  confirmed_sent: "You’re subscribed. We’ve emailed your report-reading guide.",
  confirmed_simulated: "You’re subscribed. Test mode: no email was sent.",
  confirmed_pending: "You’re subscribed. Your guide email will follow.",
  already_confirmed: "This email address is already confirmed.",
  invalid:
    "This confirmation link is invalid, expired, or was replaced by a newer one. You can sign up again from the home page.",
  unavailable: "Confirmation is not available right now. Please try again later.",
};

function readTokenFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  const token = new URLSearchParams(hash).get("t");
  if (window.location.hash) {
    window.history.replaceState(null, "", window.location.pathname);
  }
  return token && token.length < 200 ? token : null;
}

export function NewsletterConfirm() {
  const [state, setState] = useState<State>("loading");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    // Deferred so a discarded effect pass (React StrictMode) cannot consume and clear the hash.
    const id = window.setTimeout(() => {
      const t = readTokenFromHash();
      setToken(t);
      setState(t ? "ready" : "missing");
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  async function confirm() {
    if (!token) return;
    setState("submitting");
    try {
      const res = await fetch("/api/newsletter/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      const data = (await res.json()) as { status?: string; guideEmail?: string };
      if (data.status === "confirmed") {
        setState(
          data.guideEmail === "sent"
            ? "confirmed_sent"
            : data.guideEmail === "simulated"
              ? "confirmed_simulated"
              : "confirmed_pending"
        );
      } else if (data.status === "already_confirmed") {
        setState("already_confirmed");
      } else if (data.status === "invalid") {
        setState("invalid");
      } else {
        setState("unavailable");
      }
      if (data.status === "confirmed" || data.status === "already_confirmed" || data.status === "invalid") {
        setToken(null);
      }
    } catch {
      setState("unavailable");
    }
  }

  const done = state.startsWith("confirmed") || state === "already_confirmed";
  const message = MESSAGES[state];

  return (
    <div className="premium-card mt-8 px-6 py-6 md:px-8">
      {(state === "ready" || state === "submitting") && (
        <>
          <p className="text-sm leading-relaxed text-ash md:text-base">
            Confirm that you want PSL’s report-reading guide, two short follow-up emails, and occasional
            documentation and availability updates. Nothing is sent until you confirm.
          </p>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={state === "submitting"}
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-pill bg-accent px-6 text-base font-medium text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {state === "submitting" ? "Confirming…" : "Confirm my email"}
          </button>
        </>
      )}
      {state === "loading" && <p className="text-sm text-ash">Loading…</p>}
      {message && (
        <p role="status" className={`text-sm md:text-base ${done ? "text-verified-green" : "text-ink"}`}>
          {message}
        </p>
      )}
      <p className="mt-6 border-t border-linen pt-4 text-sm text-ash">
        The guide is public:{" "}
        <Link href="/science/how-to-read-a-coa" className="font-medium text-ink underline underline-offset-4">
          How to read a Certificate of Analysis
        </Link>
        . Unsubscribe at any time from any PSL Labs marketing email.
      </p>
    </div>
  );
}
