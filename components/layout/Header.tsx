"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, Search, ShoppingBag } from "lucide-react";

import { NavLinkItem } from "@/components/layout/nav-link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { primaryNavLinks } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function IconButton({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex size-10 items-center justify-center text-[var(--color-ink)] transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sage)]",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-sage)] bg-[var(--color-paper)]/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-24">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-sage)]"
          aria-label="PSL Labs home"
        >
          <Image
            src="/logo.png"
            alt="PSL Labs"
            width={160}
            height={40}
            priority
            className="h-7 w-auto md:h-8"
          />
        </Link>

        <nav
          className="hidden items-center justify-center gap-8 lg:flex"
          aria-label="Main navigation"
        >
          {primaryNavLinks.map((link) => (
            <NavLinkItem key={link.href} {...link} />
          ))}
        </nav>

        <div className="flex items-center justify-end gap-1 lg:col-start-3">
          <IconButton label="Search (placeholder)" className="hidden sm:inline-flex">
            <Search className="size-5" strokeWidth={1.5} aria-hidden />
          </IconButton>
          <IconButton label="Cart (placeholder)">
            <ShoppingBag className="size-5" strokeWidth={1.5} aria-hidden />
          </IconButton>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              className="inline-flex size-10 items-center justify-center text-[var(--color-ink)] transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sage)] lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" strokeWidth={1.5} aria-hidden />
            </SheetTrigger>
            <SheetContent
              side="right"
              showCloseButton
              className="w-full border-[var(--color-sage)] bg-[var(--color-paper)] shadow-none sm:max-w-sm"
            >
              <SheetHeader className="border-b border-[var(--color-sage)] pb-4">
                <SheetTitle className="font-[family-name:var(--font-display)] text-xl font-normal text-[var(--color-ink)]">
                  Menu
                </SheetTitle>
              </SheetHeader>
              <nav
                className="flex flex-col px-4"
                aria-label="Mobile navigation"
              >
                {primaryNavLinks.map((link) => (
                  <NavLinkItem
                    key={link.href}
                    {...link}
                    onNavigate={() => setMobileOpen(false)}
                    className="border-b border-[var(--color-sage)] py-5 text-base"
                  />
                ))}
              </nav>
              <div className="mt-auto flex gap-2 border-t border-[var(--color-sage)] px-4 py-6">
                <IconButton label="Search (placeholder)">
                  <Search className="size-5" strokeWidth={1.5} aria-hidden />
                </IconButton>
                <IconButton label="Cart (placeholder)">
                  <ShoppingBag className="size-5" strokeWidth={1.5} aria-hidden />
                </IconButton>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
