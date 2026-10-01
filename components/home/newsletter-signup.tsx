"use client";

import Link from "next/link";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { NEWSLETTER_SIGNUP_COPY } from "@/lib/newsletter/copy";
import { trackPlausibleClientEvent } from "@/lib/plausible/client";

export function NewsletterSignup({ variant = "legacy" }: { variant?: "legacy" | "welcome" }) {
  const copy = NEWSLETTER_SIGNUP_COPY[variant];
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          placement: "home_newsletter",
          signupCopyVersion: copy.version,
          website,
        }),
      });
      const data = (await res.json()) as { message?: string; error?: string };

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setMessage(
        data.message ??
          "Thank you. You'll receive updates on new batch documentation and product availability."
      );
      setEmail("");
      trackPlausibleClientEvent("newsletter_signup");
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <section
      id="newsletter"
      className="scroll-mt-24 border-t border-linen bg-gradient-to-b from-soft-blue/60 via-ice-blue to-paper px-6 py-16 md:px-16 md:py-20 lg:px-24"
    >
      <div className="mx-auto max-w-[640px] text-center">
        <p className="mono text-ash">{copy.eyebrow}</p>
        <h2 className="mt-3 font-display text-display-md font-bold text-ink">
          {copy.heading}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ash md:text-base">
          {copy.text}
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-stretch"
        >
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <Input
            id="newsletter-email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "loading" || status === "success"}
            placeholder="you@lab.org"
            className="h-12 flex-1 rounded-lg border-linen bg-lab-white px-4 text-base md:text-sm"
          />
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="newsletter-website">Website</label>
            <input
              id="newsletter-website"
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={status === "loading" || status === "success"}
            className="inline-flex h-12 items-center justify-center rounded-pill bg-accent px-6 text-base font-medium text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "loading" ? "Submitting…" : copy.button}
          </button>
        </form>

        {copy.supporting && (
          <p className="mt-3 text-xs text-ash md:text-sm">
            {copy.supporting}{" "}
            <span className="block sm:inline">
              The guide is also public:{" "}
              <Link
                href="/science/how-to-read-a-coa"
                className="font-medium text-ink underline underline-offset-4"
              >
                How to read a COA
              </Link>
              .
            </span>
          </p>
        )}

        {message && (
          <p
            role="status"
            className={`mt-4 text-sm ${
              status === "error" ? "text-signal" : "text-verified-green"
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
