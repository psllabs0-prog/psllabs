import { cn } from "@/lib/utils";

import { PslMarkSvg } from "@/components/branding/psl-mark";

export type PSLLogoProps = {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  /** When true, mark is decorative (parent supplies accessible name). */
  decorative?: boolean;
};

/**
 * PSL brand lockup: shared mark + optional wordmark.
 * Mark geometry lives in psl-mark.tsx (same source as favicon / OG).
 */
export function PSLLogo({
  size = 32,
  className,
  showWordmark = false,
  decorative = false,
}: PSLLogoProps) {
  const markDecorative = decorative || showWordmark;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5",
        showWordmark && "gap-3",
        className
      )}
    >
      {markDecorative ? (
        <PslMarkSvg size={size} decorative className="shrink-0" />
      ) : (
        <PslMarkSvg
          size={size}
          titleId="psl-logo-title"
          className="shrink-0"
        />
      )}

      {showWordmark && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="font-display text-[1.05em] font-bold tracking-[-0.03em] text-ink">
            PSL Labs
          </span>
          <span className="mt-1 text-[0.65em] font-medium tracking-[0.02em] text-ash">
            Research Peptides
          </span>
        </span>
      )}
    </span>
  );
}
