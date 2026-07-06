import { cn } from "@/lib/utils";

type SectionShellProps = {
  label: string;
  title?: string;
  children: React.ReactNode;
  variant?: "paper" | "white" | "ice" | "soft";
  width?: "prose" | "content" | "wide";
  className?: string;
};

const widthClasses = {
  prose: "max-w-[720px]",
  content: "max-w-[1200px]",
  wide: "max-w-[1440px]",
};

const variantClasses = {
  paper: "bg-paper",
  white: "bg-lab-white",
  ice: "section-surface-ice",
  soft: "section-surface-soft",
};

export function SectionShell({
  label,
  title,
  children,
  variant = "paper",
  width = "content",
  className,
}: SectionShellProps) {
  return (
    <section
      className={cn(
        "border-t border-linen px-6 py-12 md:px-12 md:py-16 lg:px-24 lg:py-20",
        variantClasses[variant],
        className
      )}
    >
      <div className={cn("mx-auto", widthClasses[width])}>
        <header className="mb-8 md:mb-10">
          <p className="mono text-ash">{label}</p>
          {title && (
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(1.75rem,3vw,2.25rem)] leading-tight tracking-[-0.02em] text-ink">
              {title}
            </h2>
          )}
        </header>
        {children}
      </div>
    </section>
  );
}
