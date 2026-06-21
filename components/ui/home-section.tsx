import { cn } from "@/lib/utils";

type PastelBg = "lavender" | "blush" | "mint" | "pale-yellow" | "paper";

type HomeSectionProps = {
  children: React.ReactNode;
  background?: PastelBg;
  className?: string;
  id?: string;
};

const backgrounds: Record<PastelBg, string> = {
  lavender: "bg-lavender",
  blush: "bg-blush",
  mint: "bg-mint",
  "pale-yellow": "bg-pale-yellow",
  paper: "bg-[var(--color-paper)]",
};

export function HomeSection({
  children,
  background = "paper",
  className,
  id,
}: HomeSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "px-6 py-24 md:px-12 md:py-28 lg:px-24",
        backgrounds[background],
        className
      )}
    >
      {children}
    </section>
  );
}
