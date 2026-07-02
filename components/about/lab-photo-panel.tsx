import { LabIllustration } from "@/components/illustrations/lab-illustrations";
import { ProductVialImage } from "@/components/product/product-vial-image";
import { PRODUCT_VIAL_IMAGE } from "@/lib/products/images";
import type { LabPhoto } from "@/lib/about";
import { cn } from "@/lib/utils";

type LabPhotoPanelProps = {
  photo: LabPhoto;
  className?: string;
  priority?: boolean;
};

const variantStyles: Record<
  LabPhoto["variant"],
  { gradient: string; illustration?: "hplc" | "batch-coa" | "quality-panel" | "research-docs" }
> = {
  vial: {
    gradient:
      "from-biotech-mist via-lab-white to-biotech-pale/60",
  },
  hplc: {
    gradient: "from-biotech-deep/8 via-biotech-pale to-lab-white",
    illustration: "hplc",
  },
  documentation: {
    gradient: "from-lab-white via-biotech-mist to-biotech-pale/80",
    illustration: "batch-coa",
  },
  quality: {
    gradient: "from-biotech-pale/40 via-lab-white to-biotech-mist",
    illustration: "quality-panel",
  },
};

export function LabPhotoPanel({ photo, className, priority }: LabPhotoPanelProps) {
  const style = variantStyles[photo.variant];

  return (
    <figure
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-linen bg-lab-white shadow-[0_4px_24px_rgba(26,77,109,0.08)]",
        className
      )}
    >
      <div className="relative">
        {photo.variant === "vial" ? (
          <ProductVialImage
            src={PRODUCT_VIAL_IMAGE.src}
            alt={photo.alt}
            context="card"
            priority={priority}
            bordered={false}
            rounded="none"
            className="rounded-none"
          />
        ) : (
          <div
            className={cn(
              "relative flex aspect-[4/5] items-center justify-center bg-gradient-to-br p-8 md:p-10",
              style.gradient
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_30%,rgba(61,107,140,0.14),transparent)]"
            />
            {style.illustration ? (
              <div className="relative z-10 w-full max-w-[180px] md:max-w-[200px]">
                <div className="overflow-hidden rounded-xl border border-biotech-blue/15 bg-lab-white/80 p-6 shadow-soft-card backdrop-blur-sm">
                  <LabIllustration id={style.illustration} className="size-full" />
                </div>
              </div>
            ) : null}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(14,15,14,0.06)_100%)]"
            />
          </div>
        )}
      </div>

      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/75 via-ink/40 to-transparent px-5 pb-5 pt-16 md:px-6 md:pb-6">
        <p className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-wider text-lab-white/70">
          Laboratory
        </p>
        <p className="mt-1 text-sm font-medium leading-snug text-lab-white md:text-base">
          {photo.caption}
        </p>
      </figcaption>
    </figure>
  );
}
