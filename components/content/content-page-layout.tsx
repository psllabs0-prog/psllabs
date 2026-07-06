import { AnimateIn } from "@/components/product/animate-in";
import type { ContentPageMeta } from "@/lib/content/types";

type ContentPageLayoutProps = {
  meta: ContentPageMeta;
  children: React.ReactNode;
};

export function ContentPageLayout({ meta, children }: ContentPageLayoutProps) {
  return (
    <main className="section-surface-ice min-h-screen">
      <div className="mx-auto max-w-[720px] px-6 py-16 md:px-12 md:py-20 lg:px-24 lg:py-24">
        <header className="mb-10 md:mb-12">
          <AnimateIn>
            <p className="mono text-ash">{meta.label}</p>
          </AnimateIn>
          <AnimateIn delay={0.08}>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,2.5rem)] leading-[1.15] tracking-[-0.02em] text-ink">
              {meta.title}
            </h1>
          </AnimateIn>
          {meta.intro?.map((paragraph, index) => (
            <AnimateIn key={index} delay={0.12 + index * 0.04}>
              <p className="mt-5 text-base leading-relaxed text-ash md:text-[1.0625rem]">
                {paragraph}
              </p>
            </AnimateIn>
          ))}
        </header>

        <div className="flex flex-col gap-10 md:gap-12">{children}</div>
      </div>
    </main>
  );
}
