import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type TrustElementProps = {
  icon: LucideIcon;
  label: string;
  className?: string;
};

export function TrustElement({ icon: Icon, label, className }: TrustElementProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 text-center",
        className
      )}
    >
      <div
        className="flex size-12 items-center justify-center rounded-xl bg-[var(--color-lab-white)] shadow-soft-card"
        aria-hidden
      >
        <Icon className="size-5 text-near-black" strokeWidth={1.5} />
      </div>
      <p className="font-display text-sm font-bold tracking-[-0.02em] text-near-black md:text-base">
        {label}
      </p>
    </div>
  );
}
