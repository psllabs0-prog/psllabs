import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type WhyChooseCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
};

export function WhyChooseCard({
  icon: Icon,
  title,
  description,
  className,
}: WhyChooseCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col gap-5 rounded-lg border border-linen bg-lab-white p-6 md:p-8",
        className
      )}
    >
      <div className="icon-tile size-12" aria-hidden>
        <Icon className="size-5 text-ink" strokeWidth={1.25} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-ink">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-ash md:text-base">
          {description}
        </p>
      </div>
    </article>
  );
}
