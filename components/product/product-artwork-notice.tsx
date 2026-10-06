import { ChevronDown } from "lucide-react";
import { getProductArtworkDisclosure } from "@/lib/products/artwork-disclosures";
import { cn } from "@/lib/utils";

export function ProductArtworkNotice({
  handle,
  imageSrc,
  className,
  collapsed = false,
}: {
  handle?: string;
  imageSrc?: string;
  className?: string;
  collapsed?: boolean;
}) {
  const disclosure = getProductArtworkDisclosure({ handle, imageSrc });
  if (!disclosure) return null;

  const notice = (
    <aside
      role="note"
      aria-label="Label discrepancy"
      data-product-artwork-notice
      className={cn(
        "rounded-xl border border-amber-300/45 bg-amber-950 p-4 text-sm leading-relaxed text-amber-100",
        !collapsed && className,
      )}
    >
      <p className="mb-1 font-semibold">Label discrepancy</p>
      <p>{disclosure}</p>
    </aside>
  );

  if (!collapsed) return notice;

  return (
    <details className={cn("group", className)} data-product-artwork-details>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md py-2 text-xs font-medium text-amber-200/90 transition-colors hover:text-amber-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span>Label claim differs · View details</span>
        <ChevronDown className="ml-auto size-4 shrink-0 group-open:rotate-180" aria-hidden />
      </summary>
      {notice}
    </details>
  );
}
