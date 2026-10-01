import type { Metadata } from "next";

import { NewsletterConfirm } from "@/components/newsletter/newsletter-confirm";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Confirm your email",
    description: "Confirm your PSL Labs email updates.",
    path: "/newsletter/confirm",
  }),
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function NewsletterConfirmPage() {
  return (
    <main className="min-h-screen bg-paper px-6 py-16 md:px-16 md:py-20">
      <div className="mx-auto max-w-xl">
        <p className="mono text-ash">UPDATES</p>
        <h1 className="mt-3 font-display text-display-md font-bold text-ink">Confirm your email</h1>
        <NewsletterConfirm />
      </div>
    </main>
  );
}
