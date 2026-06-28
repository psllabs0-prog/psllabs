"use client";

import { useState } from "react";

import { PillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

const fieldClassName = cn(
  "w-full rounded-md border border-linen bg-lab-white px-4 py-3 text-base text-ink",
  "placeholder:text-ash",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol"
);

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = () => {
    // TODO: Connect email service here (e.g. Resend, SendGrid, Postmark).
    // Example: await fetch("/api/contact", { method: "POST", body: JSON.stringify({ name, email, message }) });
    console.log("Contact form submitted:", { name, email, message });
  };

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-linen bg-lab-white p-6 md:p-8">
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
          className={cn(fieldClassName, "min-h-[144px] resize-y")}
        />
      </div>

      <PillButton type="button" onClick={handleSubmit} className="w-fit">
        Send message
      </PillButton>
    </div>
  );
}
