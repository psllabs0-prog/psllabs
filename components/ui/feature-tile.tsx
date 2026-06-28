import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type FeatureTileProps = {
  icon?: React.ReactNode;
  title: string;
  description: string;
  className?: string;
};

export function FeatureTile({
  icon,
  title,
  description,
  className,
}: FeatureTileProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-linen bg-lab-white p-6 md:p-8",
        className
      )}
    >
      <div className="icon-tile size-12" aria-hidden>
        {icon ?? (
          <span className="font-display text-lg font-bold text-ink">·</span>
        )}
      </div>
      <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-ink">
        {title}
      </h3>
      <p className="text-base leading-relaxed text-ash">{description}</p>
    </div>
  );
}
