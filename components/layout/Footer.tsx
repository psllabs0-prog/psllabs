import Image from "next/image";
import Link from "next/link";

import { footerLegalLinks, footerNavLinks } from "@/lib/navigation";

export function Footer() {
  return (
    <footer className="border-t border-near-black/10 bg-[var(--color-lab-white)]">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-16 md:py-28 lg:px-24">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-16">
          {/* Brand */}
          <div className="flex flex-col gap-5 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex w-fit transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-sage)]"
              aria-label="PSL Labs home"
            >
              <Image
                src="/logo.png"
                alt="PSL Labs"
                width={140}
                height={36}
                className="h-7 w-auto"
              />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-[var(--color-stone)]">
              Clinical-grade longevity compounds. Third-party verified, every
              batch. Designed to compound.
            </p>
            <p className="text-xs leading-relaxed text-[var(--color-stone)]">
              These statements have not been evaluated by the Food and Drug
              Administration. This product is not intended to diagnose, treat,
              cure, or prevent any disease.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <p className="mono mb-4 text-[var(--color-stone)]">Navigate</p>
            <ul className="flex flex-col gap-3">
              {footerNavLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[var(--color-stone)] transition-opacity duration-200 ease-out hover:text-[var(--color-ink)] hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sage)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support / legal */}
          <div>
            <p className="mono mb-4 text-[var(--color-stone)]">Support</p>
            <ul className="flex flex-col gap-3">
              {footerLegalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[var(--color-stone)] transition-opacity duration-200 ease-out hover:text-[var(--color-ink)] hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sage)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Newsletter placeholder */}
          <div>
            <p className="mono mb-2 text-[var(--color-stone)]">Newsletter</p>
            <p className="mb-4 font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">
              The PSL Protocol Guide
            </p>
            <div
              className="flex flex-col gap-3 sm:flex-row"
              role="group"
              aria-label="Newsletter signup (placeholder)"
            >
              <label htmlFor="footer-email" className="sr-only">
                Email address
              </label>
              <input
                id="footer-email"
                type="email"
                name="email"
                placeholder="you@example.com"
                autoComplete="email"
                className="min-w-0 flex-1 rounded-md border border-[var(--color-sage)] bg-[var(--color-paper)] px-4 py-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-stone)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sage)]"
              />
              <button
                type="button"
                className="shrink-0 rounded-md bg-[var(--color-sage)] px-5 py-3 text-sm font-medium text-[var(--color-lab-white)] transition-opacity duration-200 ease-out hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sage)]"
              >
                Subscribe
              </button>
            </div>
            <p className="mt-3 text-xs text-[var(--color-stone)]">
              Placeholder — no emails collected yet.
            </p>
          </div>
        </div>

        <div className="mt-12 border-t border-[var(--color-sage)] pt-8 md:mt-16">
          <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-stone)]">
            © {new Date().getFullYear()} PSL Labs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
