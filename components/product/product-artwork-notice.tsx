import { getProductArtworkDisclosure } from "@/lib/products/artwork-disclosures";
import { cn } from "@/lib/utils";

export function ProductArtworkNotice({
  handle,
  imageSrc,
  className,
}: {
  handle?: string;
  imageSrc?: string;
  className?: string;
}) {
  const disclosure = getProductArtworkDisclosure({ handle, imageSrc });
  if (!disclosure) return null;

  return (
    <aside
      role="note"
      aria-label="Label discrepancy"
      data-product-artwork-notice
      className={cn(
        "rounded-xl border border-amber-300/45 bg-amber-950 p-4 text-sm leading-relaxed text-amber-100",
        className,
      )}
    >
      <p className="mb-1 font-semibold">Label discrepancy</p>
      <p>{disclosure}</p>
    </aside>
  );
}
