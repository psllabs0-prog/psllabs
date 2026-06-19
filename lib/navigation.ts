export type NavLink = {
  label: string;
  href: string;
};

export const primaryNavLinks: NavLink[] = [
  { label: "Shop", href: "/#shop" },
  { label: "Protocol", href: "/protocol" },
  { label: "Science", href: "/science" },
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
];

export const footerNavLinks: NavLink[] = [
  { label: "Shop", href: "/#shop" },
  { label: "Protocol", href: "/protocol" },
  { label: "Science", href: "/science" },
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Testing", href: "/testing" },
];

export const footerLegalLinks: NavLink[] = [
  { label: "Shipping", href: "/shipping" },
  { label: "Returns", href: "/returns" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

/** Returns true when the nav item should appear active for the current path. */
export function isNavLinkActive(pathname: string, href: string): boolean {
  if (href === "/#shop" || href === "/") {
    return pathname === "/" || pathname.startsWith("/products");
  }

  const path = href.split("#")[0];
  if (!path) return false;

  return pathname === path || pathname.startsWith(`${path}/`);
}
