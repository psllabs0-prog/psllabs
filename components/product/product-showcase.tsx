"use client";

import Image from "next/image";
import { useEffect, useRef, type PointerEvent } from "react";

import { cn } from "@/lib/utils";
import { ProductArtworkDialog } from "./product-artwork-dialog";
import { ProductArtworkNotice } from "./product-artwork-notice";
import styles from "./product-showcase.module.css";

type ProductShowcaseProps = {
  src: string;
  alt: string;
  name: string;
  strength?: string;
  variant?: "hero" | "product";
};

/** A perspective scene using the approved artwork, not a 360° product model. */
export function ProductShowcase({ src, alt, name, strength, variant = "product" }: ProductShowcaseProps) {
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const canMove = useRef(false);

  function reset() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    stage.current?.style.removeProperty("--turn-x");
    stage.current?.style.removeProperty("--turn-y");
    stage.current?.style.removeProperty("--light-x");
    stage.current?.style.removeProperty("--light-y");
  }

  useEffect(() => {
    const preference = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    const update = () => {
      canMove.current = preference.matches;
      if (!preference.matches) reset();
    };
    update();
    preference.addEventListener("change", update);
    return () => {
      preference.removeEventListener("change", update);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!canMove.current || event.pointerType === "touch") return;
    // Portal events should not tilt the scene behind the enlarged image.
    if (!event.currentTarget.contains(event.target as Node)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const element = stage.current;
      if (!element) return;
      element.style.setProperty("--turn-x", `${(0.5 - y) * 9}deg`);
      element.style.setProperty("--turn-y", `${(x - 0.5) * 12}deg`);
      element.style.setProperty("--light-x", `${35 + x * 30}%`);
      element.style.setProperty("--light-y", `${20 + y * 30}%`);
    });
  }

  return (
    <>
      <div ref={stage} className={cn(styles.stage, variant === "hero" ? styles.hero : styles.product)} onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset} data-product-showcase>
        <div className={styles.grid} aria-hidden />
        <div className={styles.glow} aria-hidden />
        <div className={styles.topline}>
          <span>PSL LABS</span>
          <span>{name}{strength ? ` / ${strength}` : ""}</span>
        </div>
        <div className={styles.scene}>
          <div className={styles.orbit} aria-hidden />
          <div className={styles.wordmark} aria-hidden>PSL</div>
          <div className={styles.platform} aria-hidden>
            <div className={styles.platformTop} />
            <div className={styles.platformLight} />
          </div>
          <div className={styles.shadow} aria-hidden />
          <div key={src} className={styles.artwork}>
            <Image src={src} alt={alt} fill preload sizes="(max-width: 640px) 90vw, (max-width: 1023px) 520px, 600px" className={styles.image} />
          </div>
        </div>
        <div className={styles.caption}>
          <span className={styles.captionMarker} aria-hidden />
          <span>For laboratory research</span>
          <span className={styles.captionRule} aria-hidden />
          <ProductArtworkDialog key={src} src={src} alt={alt} name={name} strength={strength} />
        </div>
      </div>
      <ProductArtworkNotice imageSrc={src} className="mt-3" />
    </>
  );
}
