import { cn } from "@/lib/utils";

type SectionBg =
  | "paper"
  | "canvas"
  | "panel"
  | "hero"
  | "warm"
  | "cool"
  | "section-panel"
  | "biotech-mist"
  | "ice"
  | "soft";

type HomeSectionProps = {
  children: React.ReactNode;
  background?: SectionBg;
  size?: "default" | "editorial" | "compact";
  className?: string;
  id?: string;
};

const backgrounds: Record<SectionBg, string> = {
  paper: "bg-paper",
  canvas: "bg-canvas",
  panel: "bg-panel",
  hero: "bg-section-hero",
  warm: "bg-section-warm",
  cool: "bg-section-cool",
  "section-panel": "bg-section-panel",
  "biotech-mist": "bg-biotech-mist",
  ice: "section-surface-ice",
  soft: "section-surface-soft",
};

const sizes = {
  default: "px-6 py-16 md:px-12 md:py-20 lg:px-24",
  editorial: "px-6 py-20 md:px-16 md:py-28 lg:px-24 lg:py-32",
  compact: "px-6 py-14 md:px-12 md:py-16 lg:px-24 lg:py-20",
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
