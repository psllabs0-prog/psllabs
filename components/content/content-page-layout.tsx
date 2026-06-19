import { AnimateIn } from "@/components/product/animate-in";
import type { ContentPageMeta } from "@/lib/content/types";

type ContentPageLayoutProps = {
  meta: ContentPageMeta;
  children: React.ReactNode;
};

export function ContentPageLayout({ meta, children }: ContentPageLayoutProps) {
  return (
    <main className="bg-[var(--color-paper)]">
      <div className="mx-auto max-w-[720px] px-6 py-20 md:px-12 md:py-28 lg:px-24 lg:py-32">
        <header className="mb-14 md:mb-16">
          <AnimateIn>
            <p className="mono text-[var(--color-stone)]">{meta.label}</p>
          </AnimateIn>
          <AnimateIn delay={0.08}>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-[var(--color-ink)]">
              {meta.title}
            </h1>
          </AnimateIn>
          {meta.intro?.map((paragraph, index) => (
            <AnimateIn key={index} delay={0.12 + index * 0.04}>
              <p className="mt-6 text-base leading-relaxed text-[var(--color-stone)] md:text-[1.0625rem]">
                {paragraph}
              </p>
            </AnimateIn>
          ))}
        </header>

        <div className="flex flex-col gap-14 md:gap-16">{children}</div>
      </div>
    </main>
  );
}
