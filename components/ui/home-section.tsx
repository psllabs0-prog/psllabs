import { cn } from "@/lib/utils";

type PastelBg = "lavender" | "blush" | "mint" | "pale-yellow" | "paper";

type HomeSectionProps = {
  children: React.ReactNode;
  background?: PastelBg;
  size?: "default" | "editorial";
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

const sizes = {
  default: "px-6 py-24 md:px-12 md:py-28 lg:px-24",
  editorial: "px-6 py-28 md:px-16 md:py-36 lg:px-24 lg:py-44",
};

export function HomeSection({
  children,
  background = "paper",
  size = "default",
  className,
  id,
}: HomeSectionProps) {
  return (
    <section
      id={id}
      className={cn(sizes[size], backgrounds[background], className)}
    >
      {children}
    </section>
  );
}
