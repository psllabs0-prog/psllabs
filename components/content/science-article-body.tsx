import type { ReactNode } from "react";

import { AnimateIn } from "@/components/product/animate-in";

/** Each block group remains server-rendered; only its small motion frame hydrates. */
export function ScienceArticleSection({ children }: { children?: ReactNode }) {
  return (
    <AnimateIn>
      <section className="[&>p:last-child]:mb-0 [&>ul:last-child]:mb-0">{children}</section>
    </AnimateIn>
  );
}

export function ScienceSectionHeading({ children, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2 {...props} className="mb-4 font-display text-2xl leading-tight tracking-[-0.02em] text-ink">
      {children}
    </h2>
  );
}
