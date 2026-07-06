import Link from "next/link";

import { FooterColumn } from "@/components/layout/footer-column";
import { footerColumns, footerDisclaimer } from "@/lib/navigation";

export function Footer() {
  return (
    <footer className="border-t border-linen bg-gradient-to-b from-soft-blue/80 via-ice-blue to-canvas">
      <div className="mx-auto max-w-[1440px] px-6 py-14 md:px-16 md:py-20 lg:px-24">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-12">
          <div className="flex flex-col gap-4 lg:col-span-1">
            <Link
              href="/"
              className="font-display text-lg font-bold tracking-[-0.03em] text-ink transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-blue"
            >
              PSL Labs
            </Link>
            <p className="max-w-xs text-xs leading-relaxed text-ash">
              {footerDisclaimer}
            </p>
            <a
              href="mailto:support@psllabs.org"
              className="text-sm text-primary-blue transition-opacity duration-200 hover:opacity-80"
            >
              support@psllabs.org
            </a>
          </div>

          {footerColumns.map((column) => (
            <FooterColumn key={column.title} {...column} />
          ))}
        </div>

        <div className="mt-10 border-t border-linen pt-6 md:mt-12">
          <p className="font-[family-name:var(--font-mono)] text-xs text-ash">
            © {new Date().getFullYear()} PSL Labs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
