import Image from "next/image";

import {
  PRODUCT_CARD_GRADIENT,
  PRODUCT_CARD_RADIAL,
  VIAL_CONTEXT_CONFIG,
  type ProductVialContext,
} from "@/lib/products/images";
import { cn } from "@/lib/utils";

type ProductVialImageProps = {
  src: string;
  alt: string;
  context?: ProductVialContext;
  priority?: boolean;
  /** Floating animation — homepage hero only */
  animate?: boolean;
  aspectRatio?: "4/5" | "square";
  rounded?: "2xl" | "none" | "l-2xl";
  bordered?: boolean;
  className?: string;
};

export function ProductVialImage({
  src,
  alt,
  context = "card",
  priority = false,
  animate = false,
  aspectRatio = "4/5",
  rounded = "2xl",
  bordered = true,
  className,
}: ProductVialImageProps) {
  const config = VIAL_CONTEXT_CONFIG[context];

  const roundedClass =
    rounded === "none"
      ? "rounded-none"
      : rounded === "l-2xl"
        ? "rounded-none lg:rounded-l-2xl"
        : "rounded-2xl";

  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden",
        PRODUCT_CARD_GRADIENT,
        bordered && "border border-biotech-pale/70",
        aspectRatio === "square" ? "aspect-square" : "aspect-[4/5]",
        roundedClass,
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-lab-white"
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0",
          PRODUCT_CARD_RADIAL
        )}
      />

      <div
        className={cn(
          "relative z-10 flex h-full w-full items-center justify-center",
          context === "card" ? "p-7 md:p-8" : config.padding
        )}
      >
        <div
          className={cn(
            "relative mx-auto flex aspect-square w-full items-center justify-center",
            config.vialMax,
            context === "card" && "max-w-[260px]",
            animate && "animate-float"
          )}
        >
          <div
            aria-hidden
            className="absolute bottom-[5%] left-1/2 z-0 h-[12%] w-[88%] -translate-x-1/2 rounded-[100%] border border-accent/15 bg-[linear-gradient(135deg,#223440,#111b23)] shadow-[0_8px_18px_rgba(0,0,0,0.45)]"
          />
          <div
            aria-hidden
            className="absolute bottom-[8%] left-1/2 z-0 h-2 w-[55%] -translate-x-1/2 rounded-[100%] bg-biotech-deep/30 blur-sm"
          />
          <Image
            src={src}
            alt={alt}
            fill
            preload={priority}
            sizes={context === "card" ? "260px" : config.sizes}
            className="relative z-10 object-contain object-center drop-shadow-[10px_12px_10px_rgba(0,0,0,0.25)]"
          />
        </div>
      </div>
    </div>
  );
}
