import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { createBreadcrumbData } from "@/lib/structured-data";
import { cn } from "@/lib/utils";
import { JsonLd } from "./json-ld";

export type SiteBreadcrumbItem = { name: string; path: string };

/** The visible trail and its structured data share the same canonical paths. */
export function SiteBreadcrumbs({
  items,
  className,
}: {
  items: SiteBreadcrumbItem[];
  className?: string;
}) {
  if (items.length < 2) return null;

  return (
    <>
      <JsonLd data={createBreadcrumbData(items)} />
      <nav aria-label="Breadcrumb" className={cn("mb-6 text-xs text-ash", className)}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {items.map((item, index) => (
            <li key={item.path} className="flex min-w-0 items-center gap-2">
              {index > 0 && <ChevronRight className="size-3 shrink-0" aria-hidden />}
              {index === items.length - 1 ? (
                <span aria-current="page" className="break-words text-ink">{item.name}</span>
              ) : (
                <Link href={item.path || "/"} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
                  {item.name}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
