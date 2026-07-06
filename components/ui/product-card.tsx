import Link from "next/link";

import { PillButton } from "@/components/ui/pill-button";
import { cn } from "@/lib/utils";

type ProductCardProps = {
  tag: string;
  name: string;
  description: string;
  price: string;
  href: string;
  className?: string;
};

export function ProductCard({
  tag,
  name,
  description,
  price,
  href,
  className,
}: ProductCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-linen bg-lab-white transition-transform duration-200 ease-out hover:-translate-y-1",
        className
      )}
    >
      <div
        className="flex h-[320px] items-center justify-center bg-porcelain"
        role="img"
        aria-label={`${name} product image placeholder`}
      >
        <div className="h-48 w-24 rounded-md border border-linen bg-lab-white/80" />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6 md:p-8">
        <p className="mono text-ash">{tag}</p>

        <h3 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">
          {name}
        </h3>

        <p className="flex-1 text-[0.95rem] leading-relaxed text-ash">
          {description}
        </p>

        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-display text-xl font-bold text-ink">
            {price}
          </span>
        </div>

        <PillButton href={href} variant="primary" size="sm" className="w-fit">
          View
        </PillButton>
      </div>
    </article>
  );
}
