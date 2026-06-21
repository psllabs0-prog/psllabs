import type { TrustGuarantee } from "@/lib/home/home-data";

import { HomeSection } from "@/components/ui/home-section";
import { cn } from "@/lib/utils";

const iconBackgrounds: Record<
  TrustGuarantee["themeColor"],
  string
> = {
  lavender: "bg-lavender",
  blush: "bg-blush",
  mint: "bg-mint",
  "pale-yellow": "bg-pale-yellow",
};

type TrustGuaranteesProps = {
  guarantees: TrustGuarantee[];
};

export function TrustGuarantees({ guarantees }: TrustGuaranteesProps) {
  return (
    <HomeSection background="paper" size="editorial">
      <div className="mx-auto max-w-[1440px]">
        <header className="mb-16 max-w-2xl md:mb-20">
          <p className="mono mb-4 text-slate-muted">THE PSL GUARANTEE</p>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em] text-near-black">
            Quality you can verify—not just trust.
          </h2>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4 xl:gap-8">
          {guarantees.map(({ icon: Icon, title, description, themeColor }) => (
            <article
              key={title}
              className="flex flex-col gap-6 rounded-3xl border border-near-black/5 bg-[var(--color-lab-white)] p-8 md:p-10"
            >
              <div
                className={cn(
                  "flex size-14 items-center justify-center rounded-2xl",
                  iconBackgrounds[themeColor]
                )}
                aria-hidden
              >
                <Icon className="size-6 text-near-black" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col gap-3">
                <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-near-black md:text-2xl">
                  {title}
                </h3>
                <p className="text-base leading-relaxed text-slate-muted">
                  {description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </HomeSection>
  );
}
