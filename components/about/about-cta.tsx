import { PillButton } from "@/components/ui/pill-button";
import { AnimateIn } from "@/components/product/animate-in";

export function AboutCta() {
  return (
    <section className="border-t border-linen px-6 py-16 md:px-16 md:py-20 lg:px-24">
      <AnimateIn className="mx-auto flex max-w-[720px] flex-col items-center gap-8 text-center">
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-bold text-ink md:text-3xl">
            Ready to verify your next batch?
          </h2>
          <p className="text-base leading-relaxed text-ash md:text-lg">
            Browse our research catalog or review our full testing documentation
            before you order.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <PillButton href="/products">Browse products</PillButton>
          <PillButton href="/testing" variant="secondary">
            Testing standards
          </PillButton>
        </div>
        <p className="text-sm leading-relaxed text-ash">
          All products are sold strictly for laboratory and research use only.
          Not for human or animal consumption.
        </p>
      </AnimateIn>
    </section>
  );
}
