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
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { primaryNavLinks } from "@/lib/navigation";
import styles from "./storefront-shell.module.css";

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link
          href="/"
          className={styles.logo}
          aria-label="PSL Labs home"
        >
          <PSLLogo height={40} decorative eager />
        </Link>

        <nav
          className={styles.nav}
          aria-label="Main navigation"
        >
          {primaryNavLinks.map((link) => (
            <NavLinkItem key={link.href} {...link}
              className={link.href === "/products" || link.href === "/coa" ? styles.primaryNavLink : undefined} />
          ))}
        </nav>

        <div className={styles.tools}>
          <CartIconButton />

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              className={styles.menuButton}
              aria-label="Open menu"
            >
              <Menu className="size-6" strokeWidth={1.35} aria-hidden />
            </SheetTrigger>
            <SheetContent
              side="right"
              showCloseButton
              className={styles.menuPanel}
            >
              <SheetHeader className={styles.menuHeader}>
                <SheetTitle className="flex items-center gap-3 font-display text-xl font-normal text-ink">
                  <PSLLogo height={24} decorative />
                  <span>Menu</span>
                </SheetTitle>
                <SheetDescription className="sr-only">Navigate the PSL Labs catalog, batch reports and company information.</SheetDescription>
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
