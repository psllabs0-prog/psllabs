import type { Metadata } from "next";
import Link from "next/link";

import { ContactForm } from "@/components/contact/contact-form";
import { AnimateIn } from "@/components/product/animate-in";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "Contact",
  description:
    "Reach PSL Labs for order support, COA requests, and research supply questions.",
  path: "/contact",
});

const SUPPORT_EMAIL = "support@psllabs.org";

export default function ContactPage() {
  return (
    <main className="bg-[var(--color-paper)]">
      <div className="mx-auto max-w-[720px] px-6 py-20 md:px-12 md:py-28 lg:px-24 lg:py-36">
        <header className="mb-14 text-center md:mb-16">
          <AnimateIn>
            <p className="mono text-[var(--color-stone)]">CONTACT</p>
          </AnimateIn>
          <AnimateIn delay={0.08}>
            <h1 className="mt-6 font-display text-[clamp(2rem,4vw,2.75rem)] font-bold leading-[1.15] tracking-[-0.02em] text-near-black">
              Get in touch.
            </h1>
          </AnimateIn>
          <AnimateIn delay={0.12}>
            <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-slate-muted md:text-lg">
              Questions about your order, batch documentation, or research supply?
              Send us a message and we&apos;ll get back to you.
            </p>
          </AnimateIn>
        </header>

        <div className="grid grid-cols-1 gap-12 md:gap-16">
          <AnimateIn delay={0.16}>
            <aside className="flex flex-col gap-6 rounded-2xl border border-[var(--color-sage)] bg-[var(--color-lab-white)] p-6 md:p-8">
              <div>
                <p className="mono mb-2 text-[var(--color-stone)]">EMAIL</p>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-display text-lg text-near-black underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
                >
                  {SUPPORT_EMAIL}
                </a>
              </div>
              <div>
                <p className="mono mb-2 text-[var(--color-stone)]">
                  RESPONSE TIME
                </p>
                <p className="text-base leading-relaxed text-slate-muted">
                  We respond within one business day.
                </p>
              </div>
              <div>
                <p className="mono mb-2 text-[var(--color-stone)]">
                  BUSINESS HOURS
                </p>
                <p className="text-base leading-relaxed text-slate-muted">
                  Monday–Friday, 9:00 AM – 5:00 PM Eastern Time.
                </p>
              </div>
            </aside>
          </AnimateIn>

          <AnimateIn delay={0.2}>
            <ContactForm />
          </AnimateIn>
        </div>

        <AnimateIn
          delay={0.28}
          className="mt-16 border-t border-[var(--color-sage)] pt-12 text-center md:mt-20"
        >
          <Link
            href="/faq"
            className="text-sm text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
          >
            Browse FAQ →
          </Link>
        </AnimateIn>
      </div>
    </main>
  );
}
