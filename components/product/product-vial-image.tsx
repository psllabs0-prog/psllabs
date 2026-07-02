import Image from "next/image";

import { cn } from "@/lib/utils";

export type ProductVialImageSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeConfig: Record<
  ProductVialImageSize,
  { padding: string; maxWidth: string; sizes: string }
> = {
  xs: {
    padding: "p-3",
    maxWidth: "max-w-full",
    sizes: "80px",
  },
  sm: {
    padding: "p-8",
    maxWidth: "max-w-[200px]",
    sizes: "(max-width: 768px) 42vw, 200px",
  },
  md: {
    padding: "p-10 md:p-12",
    maxWidth: "max-w-[260px]",
    sizes: "(max-width: 768px) 55vw, 260px",
  },
  lg: {
    padding: "p-12 md:p-14 lg:p-16",
    maxWidth: "max-w-[300px]",
    sizes: "(max-width: 1024px) 60vw, 300px",
  },
  xl: {
    padding: "p-12 md:p-14 lg:p-16",
    maxWidth: "max-w-[375px]",
    sizes: "(max-width: 1024px) 72vw, 375px",
  },
};

type ProductVialImageProps = {
  src: string;
  alt: string;
  size?: ProductVialImageSize;
  priority?: boolean;
  animate?: boolean;
  aspectRatio?: "4/5" | "square";
  rounded?: "2xl" | "none" | "l-2xl";
  bordered?: boolean;
  className?: string;
};

export function ProductVialImage({
  src,
  alt,
  size = "md",
  priority = false,
  animate = false,
  aspectRatio = "4/5",
  rounded = "2xl",
  bordered = true,
  className,
}: ProductVialImageProps) {
  const config = sizeConfig[size];

  const roundedClass =
    rounded === "none"
      ? "rounded-none"
      : rounded === "l-2xl"
        ? "rounded-none lg:rounded-l-2xl"
        : "rounded-2xl";

  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br from-biotech-pale via-biotech-mist to-biotech-light/30",
        bordered && "border border-biotech-pale/70",
        aspectRatio === "square" ? "aspect-square" : "aspect-[4/5]",
        roundedClass,
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_65%_at_50%_42%,rgba(123,175,212,0.22),transparent)]"
      />

      <div
        className={cn(
          "relative z-10 flex h-full w-full items-center justify-center",
          config.padding
        )}
      >
        <div
          className={cn(
            "relative flex w-full items-center justify-center",
            config.maxWidth,
            animate && "animate-float"
          )}
        >
          <div
            aria-hidden
            className="absolute -bottom-1 left-1/2 z-0 h-3 w-[72%] -translate-x-1/2 rounded-[100%] bg-biotech-deep/14 blur-md"
          />
          <div
            aria-hidden
            className="absolute inset-4 -z-10 rounded-full bg-biotech-blue/12 blur-2xl"
          />
          <Image
            src={src}
            alt={alt}
            width={800}
            height={1200}
            quality={90}
            priority={priority}
            sizes={config.sizes}
            className="relative z-10 h-auto w-full object-contain drop-shadow-[0_22px_34px_rgba(26,77,109,0.22)]"
          />
        </div>
      </div>
    </div>
  );
}
