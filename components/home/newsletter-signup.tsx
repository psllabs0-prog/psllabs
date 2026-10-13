"use client";

import Link from "next/link";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { NEWSLETTER_SIGNUP_COPY } from "@/lib/newsletter/copy";
import { trackPlausibleClientEvent } from "@/lib/plausible/client";
import styles from "./research-home.module.css";

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
      className={styles.newsletter}
    >
      <div className={`${styles.container} ${styles.newsletterInner}`}>
        <div className={styles.newsletterCopy}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h2>{copy.heading}</h2>
          <p>{copy.text}</p>
        </div>
        <div className={styles.newsletterFormBlock}>
        <form
          onSubmit={handleSubmit}
          className={styles.newsletterForm}
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
            className={styles.newsletterInput}
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
            aria-describedby={copy.consent ? "newsletter-consent" : undefined}
            disabled={status === "loading" || status === "success"}
            className={`${styles.button} ${styles.buttonPrimary}`}
          >
            {status === "loading" ? "Submitting…" : copy.button}
          </button>
        </form>

        {copy.consent && (
          <>
            <p id="newsletter-consent" className={styles.newsletterConsent}>
              {copy.consent}
            </p>
            <p className={styles.newsletterGuide}>
              The guide is also public:{" "}
              <Link
                href="/science/how-to-read-a-coa"
                className="font-medium"
              >
                How to read a COA
              </Link>
              .
            </p>
          </>
        )}

        {message && (
          <p
            role="status"
            className={`${styles.newsletterMessage} ${
              status === "error" ? styles.newsletterError : ""
            }`}
          >
            {message}
          </p>
        )}
        </div>
      </div>
    </section>
  );
}
