import { ScrollReveal } from "@/components/motion/scroll-reveal";

type ProductDisclaimerProps = {
  children?: React.ReactNode;
};

export function ProductDisclaimer({ children }: ProductDisclaimerProps) {
  return (
    <section className="public-page-surface border-t border-linen px-6 py-12 md:px-12 md:py-14 lg:px-16 xl:px-20">
      <ScrollReveal className="mx-auto max-w-[800px]">
        <p className="border-l border-accent/35 pl-5 text-sm leading-[1.7] text-ash md:pl-7">
          {children ?? (
            <>
              PSL Labs products are sold strictly for laboratory and research use
              only. They are not intended for human or animal consumption,
              diagnosis, treatment, cure, or prevention of any disease.
              Laboratory reports cover only the submitted sample and tests
              reported; they do not establish safety, efficacy, or suitability
              for human or animal use.
            </>
          )}
        </p>
      </ScrollReveal>
    </section>
  );
}
