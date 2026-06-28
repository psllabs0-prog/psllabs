import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type WhyChooseCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  themeColor?: "lavender" | "blush" | "mint" | "pale-yellow";
  className?: string;
};

const iconBackgrounds = {
  lavender: "bg-lavender",
  blush: "bg-blush",
  mint: "bg-mint",
  "pale-yellow": "bg-pale-yellow",
};

export function WhyChooseCard({
  icon: Icon,
  title,
  description,
  themeColor = "lavender",
  className,
}: WhyChooseCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col gap-5 rounded-2xl bg-[var(--color-lab-white)] p-6 shadow-soft-card md:p-8",
        className
      )}
    >
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-xl",
          iconBackgrounds[themeColor]
        )}
        aria-hidden
      >
        <Icon className="size-5 text-near-black" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-bold tracking-[-0.02em] text-near-black">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-slate-muted md:text-base">
          {description}
        </p>
      </div>
    </article>
  );
}
