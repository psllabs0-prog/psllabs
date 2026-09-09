"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

type AnimateInProps = HTMLMotionProps<"div"> & {
  delay?: number;
  y?: number;
};

/**
 * Light entrance motion without hiding text from crawlers or first paint.
 * Content stays fully visible in SSR HTML and before hydration.
 */
export function AnimateIn({
  children,
  className,
  delay = 0,
  y: _y = 8,
  ...props
}: AnimateInProps) {
  return (
    <motion.div
      initial={false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-64px" }}
      transition={{ duration: 0.3, ease: "easeOut", delay }}
      style={{ opacity: 1, transform: "none" }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
