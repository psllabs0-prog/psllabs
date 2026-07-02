type ProductDisclaimerProps = {
  children?: React.ReactNode;
};

export function ProductDisclaimer({ children }: ProductDisclaimerProps) {
  return (
    <section className="border-t border-linen bg-paper px-6 py-16 md:px-16 md:py-20 lg:px-24">
      <p className="mx-auto max-w-[720px] text-sm leading-relaxed text-ash">
        {children ?? (
          <>
            These statements have not been evaluated by the Food and Drug
            Administration. This product is not intended to diagnose, treat,
            cure, or prevent any disease.
          </>
        )}
      </p>
    </section>
  );
}
