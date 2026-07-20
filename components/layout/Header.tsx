"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";

import { PSLLogo } from "@/components/branding/psl-logo";
import { CartIconButton } from "@/components/cart/cart-icon-button";
import { NavLinkItem } from "@/components/layout/nav-link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { primaryNavLinks } from "@/lib/navigation";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-linen bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:px-24">
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-2.5 transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-blue"
          aria-label="PSL Labs home"
        >
          <PSLLogo size={32} decorative />
          <span className="font-display text-lg font-bold tracking-[-0.03em] text-ink">
            PSL Labs
          </span>
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
          <CartIconButton />

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              className="inline-flex size-11 items-center justify-center rounded-lg text-ink transition-colors duration-200 ease-out hover:bg-soft-blue/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-blue lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-6" strokeWidth={1.35} aria-hidden />
            </SheetTrigger>
            <SheetContent
              side="right"
              showCloseButton
              className="w-full border-linen bg-paper shadow-none sm:max-w-sm"
            >
              <SheetHeader className="border-b border-linen pb-4">
                <SheetTitle className="flex items-center gap-2.5 font-display text-xl font-normal text-ink">
                  <PSLLogo size={28} decorative />
                  <span>Menu</span>
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
                    className="border-b border-linen py-5 text-base"
                  />
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
