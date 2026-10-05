import { cn } from "@/lib/utils";
import { ScrollReveal } from "@/components/motion/scroll-reveal";

type SectionShellProps = {
  id?: string;
  label: string;
  title?: string;
  children: React.ReactNode;
  variant?: "paper" | "white" | "ice" | "soft";
  width?: "prose" | "content" | "wide";
  className?: string;
};

const widthClasses = {
  prose: "max-w-[800px]",
  content: "max-w-[1200px]",
  wide: "max-w-[1440px]",
};

const variantClasses = {
  paper: "bg-paper",
  white: "bg-surface/40",
  ice: "public-page-surface",
  soft: "public-page-surface",
};

export function SectionShell({
  id,
  label,
  title,
  children,
  variant = "paper",
  width = "content",
  className,
}: SectionShellProps) {
  return (
    <section
      id={id}
      className={cn(
        "border-t border-linen px-6 py-14 md:px-12 md:py-20 lg:px-16 xl:px-20",
        id && "scroll-mt-24",
        variantClasses[variant],
        className
      )}
    >
      <div className={cn("mx-auto", widthClasses[width])}>
        <ScrollReveal>
          <header className="mb-8 md:mb-10">
            <p className="mono flex items-center gap-3 text-accent">
              <span className="h-px w-7 bg-accent/50" aria-hidden />
              {label}
            </p>
            {title && (
              <h2 className="mt-4 max-w-[24ch] font-display text-[clamp(1.875rem,3.3vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.035em] text-ink">
                {title}
              </h2>
            )}
          </header>
        </ScrollReveal>
        {children}
      </div>
    </section>
  );
}
