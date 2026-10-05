"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useId, useState } from "react";

import { ProductShowcase } from "@/components/product/product-showcase";
import type { HeroShowcaseProduct } from "@/lib/home/showcase";
import { cn } from "@/lib/utils";

export function HeroShowcaseSelector({ products }: { products: HeroShowcaseProduct[] }) {
  const [selectedHandle, setSelectedHandle] = useState("retatrutide");
  const panelId = useId();
  const selected = products.find((product) => product.handle === selectedHandle) ?? products[0];
  if (!selected) return null;

  return (
    <div className="relative mx-auto w-full min-w-0 max-w-[640px]" data-hero-showcase>
      <div id={panelId}>
        <ProductShowcase
          src={selected.imageSrc}
          alt={selected.imageAlt}
          name={selected.name}
          strength={selected.strength}
          variant="hero"
        />
      </div>

      <div className="mb-2 mt-4 flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.12em] text-ash">
        <p>Explore the lineup</p>
        <span aria-hidden>{String(products.indexOf(selected) + 1).padStart(2, "0")} / {String(products.length).padStart(2, "0")}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="group" aria-label="Choose the featured product">
        {products.map((product) => {
          const isSelected = product.handle === selected.handle;
          return (
            <button
              key={product.handle}
              type="button"
              aria-label={`Show ${product.name}, ${product.strength}`}
              aria-pressed={isSelected}
              aria-controls={panelId}
              title={`${product.name} · ${product.strength}`}
              onClick={() => setSelectedHandle(product.handle)}
              className={cn(
                "flex min-h-[76px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 transition-[background-color,border-color,box-shadow] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
                isSelected
                  ? "border-accent/70 bg-accent/10 shadow-[inset_0_1px_0_rgba(47,182,224,0.2)]"
                  : "border-border-strong bg-surface/60 hover:border-accent/40 hover:bg-surface",
              )}
            >
              <Image src={product.imageSrc} alt="" width={44} height={44} sizes="44px" className="size-9 object-contain sm:size-11" />
              <span className={cn("block max-w-full truncate text-[9px] sm:text-[11px]", isSelected ? "font-medium text-ink" : "text-[#aab0b9]")}>{product.shortLabel}</span>
            </button>
          );
        })}
      </div>

      <p role="status" className="sr-only">Showing {selected.name}, {selected.strength}.</p>
      <div className="mt-5 flex min-w-0 flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-ash">In focus · {selected.strength}</p>
          <Link href={selected.href} className="mt-1 inline-flex min-h-11 max-w-full items-center gap-2 font-display text-xl font-medium text-ink underline-offset-4 hover:underline sm:text-2xl">
            <span>{selected.name}</span> <ArrowUpRight className="size-4 shrink-0 text-accent" aria-hidden />
          </Link>
        </div>
        {selected.report && (
          <a
            href={selected.report.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-11 items-center justify-between gap-3 border-t border-border-strong pt-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent sm:block sm:shrink-0 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 sm:text-right"
            aria-label={`Open ${selected.name} lab report for batch ${selected.report.batch} in a new tab`}
          >
            <span className="block text-xs text-ash group-hover:text-ink">{selected.report.metric?.label ?? "Published batch report"}</span>
            <span className="inline-flex items-center gap-2 font-mono text-xl text-accent sm:mt-1 sm:text-2xl">
              {selected.report.metric?.value ?? "View report"} <ArrowUpRight className="size-3 shrink-0" aria-hidden />
            </span>
          </a>
        )}
      </div>
      <p className="mt-3 min-h-[2.8em] px-1 text-[11px] leading-relaxed text-ash">
        {selected.report
          ? `${selected.report.batch} batch · Results apply to the sample tested. See the original report for its scope.`
          : "A batch report has not yet been published for this product."}
      </p>
    </div>
  );
}
