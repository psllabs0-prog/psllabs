import Link from "next/link";
import { ChevronRight } from "lucide-react";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type GuideBreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function GuideBreadcrumbs({
  items,
  className = "",
}: GuideBreadcrumbsProps) {
  const allItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Guides", href: "/guides" },
    ...items,
  ];

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center text-xs font-mono text-ash ${className}`}
    >
      <ol className="flex flex-wrap items-center gap-1.5">
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1;

          return (
            <li key={index} className="flex items-center gap-1.5">
              {index > 0 && (
                <ChevronRight
                  className="size-3 text-stone shrink-0"
                  aria-hidden
                />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className="text-ink font-medium truncate max-w-[240px] sm:max-w-[400px]"
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
