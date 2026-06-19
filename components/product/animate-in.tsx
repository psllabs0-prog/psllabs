"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

import { cn } from "@/lib/utils";

type AnimateInProps = HTMLMotionProps<"div"> & {
  delay?: number;
  y?: number;
};

export function AnimateIn({
  children,
  className,
  delay = 0,
  y = 8,
  ...props
}: AnimateInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-64px" }}
      transition={{ duration: 0.3, ease: "easeOut", delay }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
