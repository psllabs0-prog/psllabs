"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { PillButton } from "@/components/ui/pill-button";
import type { ProductThemeColor } from "@/components/ui/product-card";
import type { HomeCarouselProduct } from "@/lib/home/home-data";

const themeGradients: Record<ProductThemeColor, string> = {
  lavender:
    "linear-gradient(165deg, var(--color-lavender) 0%, color-mix(in srgb, var(--color-lavender) 35%, white) 100%)",
  blush:
    "linear-gradient(165deg, var(--color-blush) 0%, color-mix(in srgb, var(--color-blush) 35%, white) 100%)",
  mint: "linear-gradient(165deg, var(--color-mint) 0%, color-mix(in srgb, var(--color-mint) 35%, white) 100%)",
  "pale-yellow":
    "linear-gradient(165deg, var(--color-pale-yellow) 0%, color-mix(in srgb, var(--color-pale-yellow) 35%, white) 100%)",
};

type ProductCarouselProps = {
  products: HomeCarouselProduct[];
};

function CarouselNavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-12 items-center justify-center rounded-full border border-near-black/10 bg-[var(--color-lab-white)] text-near-black transition-opacity duration-200 ease-out hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-near-black"
    >
      {children}
    </button>
  );
}

export function ProductCarousel({ products }: ProductCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const slide = el.querySelector<HTMLElement>("[data-carousel-slide]");
    const gap = 24;
    const amount = slide ? slide.offsetWidth + gap : el.clientWidth * 0.85;
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-14 flex flex-col gap-8 md:mb-20 md:flex-row md:items-end md:justify-between">
        <header className="max-w-2xl">
          <p className="mono mb-4 text-slate-muted">THE STACK</p>
          <h2 className="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-[1.08] tracking-[-0.02em] text-near-black">
            Three compounds. One daily protocol.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-muted">
            A research-focused stack built for compounding benefits—not label
            filler.
          </p>
        </header>

        <div className="hidden shrink-0 gap-3 sm:flex">
          <CarouselNavButton label="Previous product" onClick={() => scroll("left")}>
            <ChevronLeft className="size-5" strokeWidth={1.5} />
          </CarouselNavButton>
          <CarouselNavButton label="Next product" onClick={() => scroll("right")}>
            <ChevronRight className="size-5" strokeWidth={1.5} />
          </CarouselNavButton>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="-mx-6 flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-2 [scrollbar-width:none] md:-mx-12 md:px-12 lg:-mx-24 lg:px-24 [&::-webkit-scrollbar]:hidden"
      >
        {products.map((product) => (
          <article
            key={product.handle}
            data-carousel-slide
            className="flex w-[min(88vw,420px)] shrink-0 snap-start flex-col overflow-hidden rounded-3xl border border-near-black/5 bg-[var(--color-lab-white)] md:w-[min(72vw,480px)] lg:w-[520px]"
          >
            <Link
              href={product.href}
              className="group flex flex-col"
              aria-label={`View ${product.name}`}
            >
              <div
                className="relative flex h-[420px] items-end justify-center overflow-hidden md:h-[480px]"
                style={{ background: themeGradients[product.themeColor] }}
              >
                {/* Drop next/image product render here */}
                <div
                  aria-hidden
                  className="mb-10 h-[72%] w-[38%] rounded-[1.75rem] border border-near-black/8 bg-[var(--color-lab-white)]/75 transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                />
              </div>

              <div className="flex flex-col gap-5 p-8 md:p-10">
                <p className="mono text-slate-muted">{product.tag}</p>
                <h3 className="font-display text-3xl font-bold tracking-[-0.02em] text-near-black">
                  {product.name}
                </h3>
                <p className="text-base leading-relaxed text-slate-muted">
                  {product.shortDescription}
                </p>
                <div className="flex flex-wrap items-baseline gap-3 pt-2">
                  <span className="font-display text-2xl font-bold text-near-black">
                    ${product.price}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-sm text-slate-muted">
                    subscribe ↓ ${product.subscribePrice}
                  </span>
                </div>
              </div>
            </Link>

            <div className="px-8 pb-8 md:px-10 md:pb-10">
              <PillButton href={product.href} size="sm">
                View product
              </PillButton>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
