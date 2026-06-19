import { cn } from "@/lib/utils";

type SectionShellProps = {
  label: string;
  title?: string;
  children: React.ReactNode;
  variant?: "paper" | "white";
  width?: "prose" | "content" | "wide";
  className?: string;
};

const widthClasses = {
  prose: "max-w-[720px]",
  content: "max-w-[1200px]",
  wide: "max-w-[1440px]",
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
        "border-t border-[var(--color-sage)] px-6 py-16 md:px-12 md:py-24 lg:px-24 lg:py-32",
        variant === "paper"
          ? "bg-[var(--color-paper)]"
          : "bg-[var(--color-lab-white)]",
        className
      )}
    >
      <div className={cn("mx-auto", widthClasses[width])}>
        <header className="mb-10 md:mb-14">
          <p className="mono text-[var(--color-stone)]">{label}</p>
          {title && (
            <h2 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(1.75rem,3vw,2.25rem)] leading-tight tracking-[-0.02em] text-[var(--color-ink)]">
              {title}
            </h2>
          )}
        </header>
        {children}
      </div>
    </section>
  );
}
