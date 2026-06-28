import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type TrustBadgeProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
};

export function TrustBadge({
  icon: Icon,
  title,
  description,
  className,
}: TrustBadgeProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 text-center md:gap-5",
        className
      )}
    >
      <div
        className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-lab-white)] shadow-soft-card"
        aria-hidden
      >
        <Icon className="size-6 text-near-black" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-near-black md:text-xl">
          {title}
        </h3>
        <p className="max-w-xs text-sm leading-relaxed text-slate-muted md:text-base">
          {description}
        </p>
      </div>
    </div>
  );
}
