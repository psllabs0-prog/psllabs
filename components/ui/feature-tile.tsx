import { cn } from "@/lib/utils";

type PastelTheme = "lavender" | "blush" | "mint" | "pale-yellow";

type FeatureTileProps = {
  icon?: React.ReactNode;
  title: string;
  description: string;
  themeColor?: PastelTheme;
  className?: string;
};

const iconBackgrounds: Record<PastelTheme, string> = {
  lavender: "bg-lavender",
  blush: "bg-blush",
  mint: "bg-mint",
  "pale-yellow": "bg-pale-yellow",
};

export function FeatureTile({
  icon,
  title,
  description,
  themeColor = "lavender",
  className,
}: FeatureTileProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl bg-[var(--color-lab-white)] p-6 shadow-soft-card md:p-8",
        className
      )}
    >
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-2xl",
          iconBackgrounds[themeColor]
        )}
        aria-hidden
      >
        {icon ?? (
          <span className="font-display text-lg font-bold text-near-black">
            ·
          </span>
        )}
      </div>
      <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-near-black">
        {title}
      </h3>
      <p className="text-base leading-relaxed text-slate-muted">{description}</p>
    </div>
  );
}
