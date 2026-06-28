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
      <div className="icon-tile size-11" aria-hidden>
        <Icon className="size-5 text-ink" strokeWidth={1.25} />
      </div>
      <p className="font-display text-sm font-bold tracking-[-0.02em] text-ink md:text-base">
        {label}
      </p>
    </div>
  );
}
