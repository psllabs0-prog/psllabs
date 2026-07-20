import { cn } from "@/lib/utils";

export type PSLLogoProps = {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  /** When true, mark is decorative (parent supplies accessible name). */
  decorative?: boolean;
};

/**
 * Minimal PSL mark: rounded-square navy field, bold white letters,
 * thin ice-blue accent. Readable at favicon sizes.
 */
export function PSLLogo({
  size = 32,
  className,
  showWordmark = false,
  decorative = false,
}: PSLLogoProps) {
  const markDecorative = decorative || showWordmark;
  const titleId = "psl-logo-title";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5",
        showWordmark && "gap-3",
        className
      )}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
        role={markDecorative ? undefined : "img"}
        aria-hidden={markDecorative ? true : undefined}
        aria-labelledby={markDecorative ? undefined : titleId}
      >
        {!markDecorative && <title id={titleId}>PSL Labs</title>}
        <rect width="64" height="64" rx="12" fill="#0b1220" />
        <rect
          x="4"
          y="56"
          width="56"
          height="2.5"
          rx="1.25"
          fill="#38bdf8"
          opacity="0.85"
        />
        <text
          x="32"
          y="38"
          textAnchor="middle"
          fill="#ffffff"
          fontFamily="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"
          fontSize="22"
          fontWeight="700"
          letterSpacing="1.5"
        >
          PSL
        </text>
      </svg>

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
