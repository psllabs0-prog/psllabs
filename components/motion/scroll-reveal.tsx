"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type ScrollRevealProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  delayMs?: number;
  distancePx?: number;
  contentClassName?: string;
};

/** Progressive enhancement: content is visible until a real viewport re-entry. */
export function ScrollReveal({
  children,
  className,
  delayMs = 0,
  distancePx = 24,
  contentClassName,
  ...props
}: ScrollRevealProps) {
  const boundary = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const delay = Math.min(180, Math.max(0, delayMs));
  const distance = Math.min(24, Math.max(0, Math.abs(distancePx)));

  useEffect(() => {
    const frame = boundary.current;
    const body = content.current;
    if (!frame || !body || !("IntersectionObserver" in window) || typeof body.animate !== "function") return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let entrance: IntersectionObserver | null = null;
    let departure: IntersectionObserver | null = null;
    let animation: Animation | null = null;
    let armed = false;
    let generation = 0;

    function showImmediately() {
      if (!animation) return;
      animation.onfinish = null;
      animation.cancel();
      animation = null;
    }

    function disconnect() {
      generation += 1;
      entrance?.disconnect();
      departure?.disconnect();
      entrance = null;
      departure = null;
      showImmediately();
    }

    function configure() {
      disconnect();
      if (preference.matches) return;

      // Do not fade out content already painted on initial load or restored scroll.
      const initial = frame!.getBoundingClientRect();
      armed = initial.bottom <= 0 || initial.top >= window.innerHeight;
      const currentGeneration = generation;

      entrance = new IntersectionObserver(([entry]) => {
        if (currentGeneration !== generation) return;
        if (!entry.isIntersecting || entry.intersectionRatio < 0.08 || !armed || preference.matches) return;
        armed = false;
        if (frame!.contains(document.activeElement)) return;

        showImmediately();
        const center = entry.boundingClientRect.top + entry.boundingClientRect.height / 2;
        const travel = center >= window.innerHeight / 2 ? distance : -distance;
        const nextAnimation = body!.animate(
          [
            { opacity: 0.12, transform: `translate3d(0, ${travel}px, 0) scale(0.98)` },
            { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
          ],
          { duration: 620, delay, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "backwards" },
        );
        animation = nextAnimation;
        nextAnimation.onfinish = () => {
          if (animation !== nextAnimation) return;
          animation = null;
          nextAnimation.cancel();
        };
      }, { threshold: 0.08, rootMargin: "-24px 0px -24px 0px" });

      // The wider departure boundary prevents repeated fades near a viewport edge.
      // Observe the stationary outer frame so the animation cannot trigger itself.
      departure = new IntersectionObserver(([entry]) => {
        if (currentGeneration !== generation) return;
        if (entry.isIntersecting) return;
        armed = true;
        showImmediately();
      }, { threshold: 0, rootMargin: "80px 0px 80px 0px" });

      entrance.observe(frame!);
      departure.observe(frame!);
    }

    function onFocus() {
      // Tabbing or programmatic focus must never land on faded or moving content.
      armed = false;
      showImmediately();
    }

    configure();
    frame.addEventListener("focusin", onFocus);
    preference.addEventListener("change", configure);
    return () => {
      disconnect();
      frame.removeEventListener("focusin", onFocus);
      preference.removeEventListener("change", configure);
    };
  }, [delay, distance]);

  return (
    <div {...props} ref={boundary} className={className} data-scroll-reveal>
      <div ref={content} className={cn("h-full", contentClassName)} data-reveal-content>{children}</div>
    </div>
  );
}
