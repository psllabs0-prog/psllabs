"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

const THUMBNAIL_COUNT = 6;

export function ProductGallery({ productName }: { productName: string }) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="aspect-square w-full bg-[var(--color-lab-white)] transition-opacity duration-300 ease-out"
        role="img"
        aria-label={`${productName} image ${activeIndex + 1}`}
        key={activeIndex}
      />

      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: THUMBNAIL_COUNT }, (_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={cn(
              "aspect-square border border-transparent bg-[var(--color-lab-white)] transition-opacity duration-200 ease-out hover:opacity-80",
              activeIndex === index && "border-[var(--color-sage)]"
            )}
            aria-label={`View image ${index + 1}`}
            aria-pressed={activeIndex === index}
          />
        ))}
      </div>
    </div>
  );
}
