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
          config.padding
        )}
      >
        <div
          className={cn(
            "relative mx-auto flex w-full items-center justify-center",
            config.vialMax,
            animate && "animate-float"
          )}
        >
          <div
            aria-hidden
            className="absolute -bottom-2 left-1/2 z-0 h-4 w-[78%] -translate-x-1/2 rounded-[100%] bg-biotech-deep/20 blur-lg"
          />
          <div
            aria-hidden
            className="absolute bottom-[8%] left-1/2 z-0 h-2 w-[55%] -translate-x-1/2 rounded-[100%] bg-biotech-deep/30 blur-sm"
          />
          <Image
            src={src}
            alt={alt}
            width={800}
            height={1200}
            quality={90}
            priority={priority}
            sizes={config.sizes}
            className="relative z-10 h-auto max-h-full w-full object-contain object-center drop-shadow-[0_28px_40px_rgba(26,77,109,0.28)]"
          />
        </div>
      </div>
    </div>
  );
}
