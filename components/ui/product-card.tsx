import Link from "next/link";

import { PillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

export type ProductThemeColor =
  | "lavender"
  | "blush"
  | "mint"
  | "pale-yellow";

type ProductCardProps = {
  tag: string;
  name: string;
  description: string;
  price: string;
  subscribe?: string;
  href: string;
  themeColor: ProductThemeColor;
  className?: string;
};

const themeGradients: Record<ProductThemeColor, string> = {
  lavender:
    "linear-gradient(160deg, var(--color-lavender) 0%, color-mix(in srgb, var(--color-lavender) 40%, white) 100%)",
  blush:
    "linear-gradient(160deg, var(--color-blush) 0%, color-mix(in srgb, var(--color-blush) 40%, white) 100%)",
  mint: "linear-gradient(160deg, var(--color-mint) 0%, color-mix(in srgb, var(--color-mint) 40%, white) 100%)",
  "pale-yellow":
    "linear-gradient(160deg, var(--color-pale-yellow) 0%, color-mix(in srgb, var(--color-pale-yellow) 40%, white) 100%)",
};

export function ProductCard({
  tag,
  name,
  description,
  price,
  subscribe,
  href,
  themeColor,
  className,
}: ProductCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl bg-[var(--color-lab-white)] shadow-soft-card transition-transform duration-200 ease-out hover:-translate-y-1",
        className
      )}
    >
      <div
        className="flex h-[320px] items-center justify-center"
        style={{ background: themeGradients[themeColor] }}
        role="img"
        aria-label={`${name} product image placeholder`}
      >
        <div className="h-48 w-24 rounded-xl bg-[var(--color-lab-white)]/60" />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6 md:p-8">
        <p className="mono text-[var(--color-stone)]">{tag}</p>

        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-near-black">
          {name}
        </h3>

        <p className="flex-1 text-[0.95rem] leading-relaxed text-slate-muted">
          {description}
        </p>

        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-display text-xl font-bold text-near-black">
            {price}
          </span>
          {subscribe && (
            <span className="font-[family-name:var(--font-mono)] text-sm text-slate-muted">
              {subscribe}
            </span>
          )}
        </div>

        <PillButton href={href} variant="primary" size="sm" className="w-fit">
          View
        </PillButton>
      </div>
    </article>
  );
}
