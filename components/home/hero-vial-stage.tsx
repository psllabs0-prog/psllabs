"use client";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ProductPrice, SaleBadge } from "@/components/commerce/product-price";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { HeroShowcaseProduct } from "@/lib/home/showcase";
import styles from "./hero-product-visual.module.css";
type FeaturedProduct = HeroShowcaseProduct & { render?: { src: string; alt: string } };

/** Layered artwork with perspective motion, not a 360-degree model. */
export function HeroVialStage({ products }: { products: FeaturedProduct[] }) {
  const [selectedHandle, setSelectedHandle] = useState("retatrutide");
  const [selectionChanged, setSelectionChanged] = useState(false);
  const [paused, setPaused] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const pointerAllowed = useRef(false);
  const panelId = useId();
  const selected = products.find(p => p.handle === selectedHandle) ?? products[0];
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const media = matchMedia("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)");
    let inView = !("IntersectionObserver" in window);
    const setActivity = () => {
      pointerAllowed.current = media.matches && inView && !document.hidden && !paused;
      element.dataset.motion = pointerAllowed.current ? "enabled" : "disabled";
      if (!pointerAllowed.current) {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        element.style.removeProperty("--turn-x");
        element.style.removeProperty("--turn-y");
      }
    };
    const observer = "IntersectionObserver" in window ? new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      element.dataset.visible = String(entry.isIntersecting);
      setActivity();
    }, { threshold: 0.05 }) : null;
    observer?.observe(element);
    setActivity();
    media.addEventListener("change", setActivity);
    document.addEventListener("visibilitychange", setActivity);
    return () => {
      observer?.disconnect();
      media.removeEventListener("change", setActivity);
      document.removeEventListener("visibilitychange", setActivity);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [paused]);
  function reset() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    stage.current?.style.removeProperty("--turn-x");
    stage.current?.style.removeProperty("--turn-y");
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!pointerAllowed.current || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      stage.current?.style.setProperty("--turn-x", `${(0.5-y)*5}deg`);
      stage.current?.style.setProperty("--turn-y", `${(x-0.5)*7}deg`);
      frame.current = null;
    });
  }
  if (!selected) return null;
  const src = selected.render ? selected.render.src.replace("-studio.webp", "-cutout.webp") : selected.imageSrc;
  const alt = selected.render?.alt ?? `${selected.name} ${selected.strength} illustrative vial artwork`;
  return (
    <div className={styles.feature}>
      <div ref={stage} id={panelId} className={styles.stage} data-hero-stage data-visible="true" data-motion="disabled" data-selection-changed={selectionChanged} onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset}>
        <div className={styles.topline}><span>PSL / MATERIAL STUDY</span></div>
        <SaleBadge handle={selected.handle} className={styles.saleBadge} />
        <div className={styles.scene}>
          <div className={styles.grid} aria-hidden /><div className={styles.platform} aria-hidden /><div className={styles.shadow} aria-hidden />
          <div key={selected.handle} className={styles.vial}>
            <Image src={src} alt={alt} fill preload={selected.handle === "retatrutide"} sizes="(max-width: 640px) calc(72vw - 30px), (max-width: 800px) 430px, (max-width: 1100px) calc(38vw - 40px), (max-width: 1376px) calc(38vw - 58px), 462px" />
          </div>
        </div>
        <div className={styles.stageFooter}><button className={styles.motionButton} type="button" onClick={() => setPaused(v=>!v)} aria-pressed={paused}>{paused ? "Resume motion" : "Pause motion"}</button></div>
      </div>
      <div className={styles.selectionHeader}><span>EXPLORE THE LINEUP</span><span>RESEARCH USE ONLY</span></div>
      <div className={styles.selector} role="group" aria-label="Choose featured product">
        {products.map(product => <button type="button" key={product.handle} aria-pressed={product.handle===selected.handle} aria-controls={panelId} aria-label={`Show ${product.name}, ${product.strength}`} onClick={()=>{setSelectedHandle(product.handle);setSelectionChanged(true);}}><span>{product.handle === "reconstitution-solution" ? "Solution" : product.name}</span><small>{product.strength.replace(/(\d)(mg|ml)/i,"$1 $2")}</small></button>)}
      </div>
      <div className={styles.details}>
        <div><p>{selected.strength.replace(/(\d)(mg|ml)/i,"$1 $2")} / NOMINAL VIAL AMOUNT</p><h2><Link href={selected.href}>{selected.name}<ArrowUpRight size={18} aria-hidden /></Link></h2><ProductPrice handle={selected.handle} className={styles.featuredPrice} /></div>
        {selected.report && <a className={styles.report} href={selected.report.href} target="_blank" rel="noopener noreferrer"><span>{selected.report.metric?.label ?? "Published report"}</span><strong>{selected.report.metric?.value ?? "View report"}<ArrowUpRight size={13} aria-hidden /></strong></a>}
      </div>
      <p className={styles.scope}>Results apply to the tested sample. <Link href={selected.href}>Product details and batch scope</Link>.</p>
      <p role="status" className="sr-only">Showing {selected.name}, {selected.strength}.</p>
    </div>
  );
}
