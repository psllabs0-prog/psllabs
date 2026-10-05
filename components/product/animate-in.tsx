import type { HTMLAttributes } from "react";

import { ScrollReveal } from "@/components/motion/scroll-reveal";

type AnimateInProps = HTMLAttributes<HTMLDivElement> & {
  delay?: number;
  y?: number;
};

/** Keep the existing layout API while sharing the site's accessible replay motion. */
export function AnimateIn({
  children,
  className,
  delay = 0,
  y = 24,
  ...props
}: AnimateInProps) {
  return (
    <ScrollReveal
      {...props}
      className={className}
      delayMs={delay * 1000}
      distancePx={y}
      contentClassName="w-full min-w-0 [display:inherit] [flex-direction:inherit] [flex-wrap:inherit] [align-items:inherit] [justify-content:inherit] [gap:inherit] [grid-template-columns:inherit]"
    >
      {children}
    </ScrollReveal>
  );
}
