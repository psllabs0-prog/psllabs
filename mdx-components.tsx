import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: ({ children }) => (
      <h2 className="mt-12 mb-4 font-[family-name:var(--font-display)] text-2xl leading-tight tracking-[-0.02em] text-[var(--color-ink)] first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-8 mb-3 font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className="mb-6 text-base leading-relaxed text-[var(--color-stone)] last:mb-0">
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul className="mb-6 list-none space-y-2 text-base leading-relaxed text-[var(--color-stone)]">
        {children}
      </ul>
    ),
    li: ({ children }) => (
      <li className="flex gap-3">
        <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--color-sage)]">
          —
        </span>
        <span>{children}</span>
      </li>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-[var(--color-sage)] underline underline-offset-4 transition-opacity duration-200 ease-out hover:opacity-70"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => (
      <strong className="font-medium text-[var(--color-ink)]">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    ...components,
  };
}
