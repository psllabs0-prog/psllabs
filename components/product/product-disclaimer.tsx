type ProductDisclaimerProps = {
  children?: React.ReactNode;
};

export function ProductDisclaimer({ children }: ProductDisclaimerProps) {
  return (
    <section className="border-t border-linen bg-gradient-to-b from-soft-blue/40 to-paper px-6 py-12 md:px-16 md:py-14 lg:px-24">
      <p className="mx-auto max-w-[720px] text-sm leading-relaxed text-ash">
        {children ?? (
          <>
            PSL Labs products are sold strictly for laboratory and research use
            only. They are not intended for human or animal consumption,
            diagnosis, treatment, cure, or prevention of any disease. These
            statements have not been evaluated by the Food and Drug
            Administration.
          </>
        )}
      </p>
    </section>
  );
}
