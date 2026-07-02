"use client";

import { useState } from "react";

import { ProductVialImage } from "@/components/product/product-vial-image";
import { PRODUCT_VIAL_IMAGE } from "@/lib/products/images";
import { cn } from "@/lib/utils";

type ProductGalleryProps = {
  productName: string;
  imageSrc?: string;
  imageAlt?: string;
};

const THUMBNAIL_COUNT = 4;

export function ProductGallery({
  productName,
  imageSrc = PRODUCT_VIAL_IMAGE.src,
  imageAlt,
}: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const alt = imageAlt ?? `${productName} research peptide vial`;

  return (
    <div className="flex flex-col gap-4">
      <ProductVialImage
        src={imageSrc}
        alt={`${alt} — view ${activeIndex + 1}`}
        size="lg"
        priority
        className="w-full"
      />

      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: THUMBNAIL_COUNT }, (_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={cn(
              "overflow-hidden rounded-lg border-2 transition-opacity duration-200 ease-out hover:opacity-90",
              activeIndex === index
                ? "border-biotech-blue/50"
                : "border-transparent opacity-70"
            )}
            aria-label={`View image ${index + 1}`}
            aria-pressed={activeIndex === index}
          >
            <ProductVialImage
              src={imageSrc}
              alt=""
              size="xs"
              aspectRatio="square"
              rounded="2xl"
              className="pointer-events-none aspect-square w-full border-0"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
