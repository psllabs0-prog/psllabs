"use client";

import { useState } from "react";

import { PillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

const fieldClassName = cn(
  "w-full rounded-lg border border-linen bg-paper/50 px-4 py-3.5 text-base text-ink",
  "placeholder:text-ash/80",
  "transition-colors duration-200 ease-out",
  "focus-visible:border-biotech-blue/40 focus-visible:bg-lab-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol"
);

type ContactFormProps = {
  title: string;
  description: string;
};

export function ContactForm({ title, description }: ContactFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = () => {
    // TODO: Connect email service here (e.g. Resend, SendGrid, Postmark).
    console.log("Contact form submitted:", { name, email, message });
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
            className={fieldClassName}
          />
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
            className={fieldClassName}
          />
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
            className={cn(fieldClassName, "min-h-[160px] resize-y")}
          />
        </div>

        <PillButton type="button" onClick={handleSubmit} className="w-fit">
          Send message
        </PillButton>
      </div>
    </div>
  );
}
