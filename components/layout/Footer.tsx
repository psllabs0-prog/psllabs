import Link from "next/link";

import { FooterColumn } from "@/components/layout/footer-column";
import { footerColumns, footerDisclaimer } from "@/lib/navigation";

export function Footer() {
  return (
    <footer className="border-t border-linen bg-lab-white">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-16 md:py-28 lg:px-24">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5 lg:gap-16">
          <div className="flex flex-col gap-5 lg:col-span-1">
            <Link
              href="/"
              className="font-display text-lg font-bold tracking-[-0.03em] text-ink transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-petrol"
            >
              PSL Labs
            </Link>
            <p className="max-w-xs text-xs leading-relaxed text-ash">
              {footerDisclaimer}
            </p>
          </div>

          {footerColumns.map((column) => (
            <FooterColumn key={column.title} {...column} />
          ))}
        </div>

        <div className="mt-12 border-t border-linen pt-8 md:mt-16">
          <p className="font-[family-name:var(--font-mono)] text-xs text-ash">
            © {new Date().getFullYear()} PSL Labs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
