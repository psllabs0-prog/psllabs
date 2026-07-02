"use client";

import { useState } from "react";

import { ProductVialImage } from "@/components/product/product-vial-image";
import { PRODUCT_VIAL_IMAGE } from "@/lib/products/images";
import { cn } from "@/lib/utils";

type ProductGalleryProps = {
  productName: string;
  imageSrc?: string;
  imageAlt?: string;
  showThumbnails?: boolean;
};

const THUMBNAIL_COUNT = 4;

export function ProductGallery({
  productName,
  imageSrc = PRODUCT_VIAL_IMAGE.src,
  imageAlt,
  showThumbnails = false,
}: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const alt = imageAlt ?? `${productName} research peptide vial`;

  if (!showThumbnails) {
    return (
      <ProductVialImage
        src={imageSrc}
        alt={alt}
        context="product"
        priority
        className="w-full"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ProductVialImage
        src={imageSrc}
        alt={`${alt} — view ${activeIndex + 1}`}
        context="product"
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
              "overflow-hidden rounded-xl border-2 transition-opacity duration-200 ease-out hover:opacity-95",
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
              context="thumb"
              aspectRatio="square"
              rounded="2xl"
              bordered={false}
              className="pointer-events-none aspect-square w-full"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
