"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import styles from "./tilt-card.module.css";

const MAX_TILT_DEG = 4;
const MOTION_QUERY = "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

/**
 * Light pointer tilt + glare for a server-rendered card (PSL-FIX-20261022).
 * CSS variables only, at most 4 degrees, one requestAnimationFrame per pointer move.
 * Inactive on touch / coarse pointers and when the visitor prefers reduced motion.
 */
export function TiltCard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const media = window.matchMedia(MOTION_QUERY);
    let frame: number | null = null;

    const reset = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      element.removeAttribute("data-tilting");
      for (const name of ["--tilt-x", "--tilt-y", "--glare-x", "--glare-y"]) element.style.removeProperty(name);
    };
    const move = (event: PointerEvent) => {
      if (!media.matches || event.pointerType !== "mouse") return;
      const rect = element.getBoundingClientRect();
      const x = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
      const y = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.setProperty("--tilt-x", `${((0.5 - y) * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
        element.style.setProperty("--tilt-y", `${((x - 0.5) * 2 * MAX_TILT_DEG).toFixed(2)}deg`);
        element.style.setProperty("--glare-x", `${(x * 100).toFixed(1)}%`);
        element.style.setProperty("--glare-y", `${(y * 100).toFixed(1)}%`);
        element.setAttribute("data-tilting", "true");
        frame = null;
      });
    };
    const change = () => { if (!media.matches) reset(); };

    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", reset);
    element.addEventListener("pointercancel", reset);
    media.addEventListener("change", change);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", reset);
      element.removeEventListener("pointercancel", reset);
      media.removeEventListener("change", change);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className={cn(styles.tilt, className)}>{children}</div>;
}
