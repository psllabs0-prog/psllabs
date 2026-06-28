import Image from "next/image";
import Link from "next/link";

import { FooterColumn } from "@/components/layout/footer-column";
import {
  footerColumns,
  footerDisclaimer,
} from "@/lib/home/homepage";

export function Footer() {
  return (
    <footer className="border-t border-near-black/10 bg-[var(--color-lab-white)]">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-16 md:py-28 lg:px-24">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-5 lg:gap-16">
          <div className="flex flex-col gap-5 sm:col-span-2 lg:col-span-1">
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
            <p className="max-w-xs text-xs leading-relaxed text-[var(--color-stone)]">
              {footerDisclaimer}
            </p>
          </div>

          {footerColumns.map((column) => (
            <FooterColumn key={column.title} {...column} />
          ))}
        </div>

        <div className="mt-12 border-t border-near-black/10 pt-8 md:mt-16">
          <p className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-stone)]">
            © {new Date().getFullYear()} PSL Labs. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
