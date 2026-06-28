import Link from "next/link";

import type { NavLink } from "@/lib/navigation";

type FooterColumnProps = {
  title: string;
  links: NavLink[];
};

export function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <p className="mono mb-4 text-ash">{title}</p>
      <ul className="flex flex-col gap-3">
        {links.map((link) => (
          <li key={`${title}-${link.href}`}>
            <Link
              href={link.href}
              className="text-sm text-ash transition-opacity duration-200 ease-out hover:text-ink hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-petrol"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
