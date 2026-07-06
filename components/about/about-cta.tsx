import { AnimateIn } from "@/components/product/animate-in";
import { PillButton } from "@/components/ui/pill-button";
import type { AboutContent } from "@/lib/about";
import { cn } from "@/lib/utils";

const cardClass = "premium-card p-6 md:p-7";

type AboutClosingProps = {
  closing: AboutContent["closing"];
};

export function AboutClosing({ closing }: AboutClosingProps) {
  return (
    <section className="border-t border-linen bg-paper px-6 py-12 md:px-16 md:py-16 lg:px-24 lg:py-20">
      <AnimateIn className="mx-auto flex max-w-[960px] flex-col gap-10 md:gap-12">
        <article className={cn(cardClass, "flex flex-col gap-4 text-center md:gap-5")}>
          <h2 className="font-display text-display-md font-bold text-ink">
            {closing.title}
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-ash md:text-body-lg">
            {closing.body}
          </p>
        </article>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <PillButton href="/products">Browse products</PillButton>
          <PillButton href="/testing" variant="secondary">
            Testing standards
          </PillButton>
        </div>

        <p className="text-center text-sm leading-relaxed text-ash">
          All products are sold strictly for laboratory and research use only.
          Not for human or animal consumption.
        </p>
      </AnimateIn>
    </section>
  );
}
