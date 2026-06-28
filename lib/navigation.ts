export type NavLink = {
  label: string;
  href: string;
};

export const primaryNavLinks: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "Products", href: "/products" },
  { label: "Testing", href: "/testing" },
  { label: "FAQ", href: "/faq" },
  { label: "Contact", href: "/contact" },
];

export const footerNavLinks: NavLink[] = [
  { label: "Shop", href: "/products" },
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

export const footerColumns: { title: string; links: NavLink[] }[] = [
  {
    title: "Products",
    links: [{ label: "All Products", href: "/products" }],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Information",
    links: [
      { label: "FAQ", href: "/faq" },
      { label: "Testing", href: "/testing" },
      { label: "Shipping", href: "/shipping" },
      { label: "Returns", href: "/returns" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
    ],
  },
];

export const footerDisclaimer =
  "These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease. For research use only.";

/** Returns true when the nav item should appear active for the current path. */
export function isNavLinkActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/products") {
    return pathname === "/products" || pathname.startsWith("/products/");
  }

  if (href.startsWith("mailto:")) {
    return false;
  }

  const path = href.split("#")[0];
  if (!path) return false;

  return pathname === path || pathname.startsWith(`${path}/`);
}
