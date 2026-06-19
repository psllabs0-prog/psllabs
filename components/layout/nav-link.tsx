"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { isNavLinkActive, type NavLink } from "@/lib/navigation";

type NavLinkItemProps = NavLink & {
  className?: string;
  onNavigate?: () => void;
};

export function NavLinkItem({
  href,
  label,
  className,
  onNavigate,
}: NavLinkItemProps) {
  const pathname = usePathname();
  const active = isNavLinkActive(pathname, href);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-sm transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-sage)]",
        active
          ? "text-[var(--color-ink)] underline decoration-[var(--color-sage)] underline-offset-4"
          : "text-[var(--color-stone)]",
        className
      )}
    >
      {label}
    </Link>
  );
}
