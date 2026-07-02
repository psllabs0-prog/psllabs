"use client";

import { useState } from "react";

import { PillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_NAME_LENGTH = 200;

const fieldClassName = cn(
  "w-full rounded-lg border border-linen bg-paper/50 px-4 py-3.5 text-base text-ink",
  "placeholder:text-ash/80",
  "transition-colors duration-200 ease-out",
  "focus-visible:border-biotech-blue/40 focus-visible:bg-lab-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol"
);

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type ContactFormProps = {
  title: string;
  description: string;
};

export function ContactForm({ title, description }: ContactFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    message?: string;
  }>({});

  const validate = () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMessage = message.trim();
    const errors: typeof fieldErrors = {};

    if (!trimmedName) {
      errors.name = "Name is required.";
    } else if (trimmedName.length > MAX_NAME_LENGTH) {
      errors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
    }

    if (!trimmedEmail) {
      errors.email = "Email is required.";
    } else if (!isValidEmail(trimmedEmail)) {
      errors.email = "Enter a valid email address.";
    }

    if (!trimmedMessage) {
      errors.message = "Message is required.";
    } else if (trimmedMessage.length < MIN_MESSAGE_LENGTH) {
      errors.message = `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`;
    } else if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      errors.message = `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    setFeedback(null);
    if (!validate()) {
      setStatus("error");
      return;
    }

    setStatus("submitting");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok) {
        setStatus("error");
        setFeedback(
          data.error ?? "Failed to send your message. Please try again."
        );
        return;
      }

      setStatus("success");
      setFeedback("Message sent. We'll respond within one business day.");
      setName("");
      setEmail("");
      setMessage("");
      setFieldErrors({});
    } catch {
      setStatus("error");
      setFeedback("Failed to send your message. Please try again.");
    }
  };

  return (
    <div className="flex flex-col gap-8 rounded-2xl border border-linen bg-lab-white p-8 shadow-[0_4px_32px_rgba(26,77,109,0.08),0_12px_48px_rgba(26,77,109,0.04)] md:p-10 lg:p-12">
      <div className="flex flex-col gap-3 border-b border-biotech-pale/80 pb-8">
        <p className="mono text-biotech-deep/80">INQUIRY</p>
        <h2 className="font-display text-2xl font-bold text-ink md:text-3xl">
          {title}
        </h2>
        <p className="text-sm leading-relaxed text-ash md:text-base">
          {description}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="contact-name" className="text-sm font-medium text-ink">
            Name
          </label>
          <input
            id="contact-name"
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Your name"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={
              fieldErrors.name ? "contact-name-error" : undefined
            }
            className={fieldClassName}
          />
          {fieldErrors.name ? (
            <p
              id="contact-name-error"
              className="text-sm text-signal"
              role="alert"
            >
              {fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="contact-email" className="text-sm font-medium text-ink">
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@institution.edu"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={
              fieldErrors.email ? "contact-email-error" : undefined
            }
            className={fieldClassName}
          />
          {fieldErrors.email ? (
            <p
              id="contact-email-error"
              className="text-sm text-signal"
              role="alert"
            >
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="contact-message" className="text-sm font-medium text-ink">
            Message
          </label>
          <textarea
            id="contact-message"
            name="message"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Order number, lot number, or your question…"
            aria-invalid={Boolean(fieldErrors.message)}
            aria-describedby={
              fieldErrors.message ? "contact-message-error" : undefined
            }
            className={cn(fieldClassName, "min-h-[160px] resize-y")}
          />
          {fieldErrors.message ? (
            <p
              id="contact-message-error"
              className="text-sm text-signal"
              role="alert"
            >
              {fieldErrors.message}
            </p>
          ) : null}
        </div>

        {feedback ? (
          <p
            role="status"
            className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              status === "success"
                ? "border-biotech-pale bg-biotech-mist/60 text-biotech-deep"
                : "border-signal/30 bg-signal/5 text-signal"
            )}
          >
            {feedback}
          </p>
        ) : null}

        <PillButton
          type="button"
          onClick={handleSubmit}
          disabled={status === "submitting"}
          className="w-fit"
        >
          {status === "submitting" ? "Sending…" : "Send message"}
        </PillButton>
      </div>
    </div>
  );
}
