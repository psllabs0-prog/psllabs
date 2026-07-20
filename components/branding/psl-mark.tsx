import { PSL_MARK } from "@/lib/branding";

/** Shared mark geometry (64×64 design space). */
export const PSL_MARK_VIEWBOX = 64;
export const PSL_MARK_RADIUS = 12;
/** Cap-height letter size — one size for P, S, and L together. */
export const PSL_MARK_FONT_SIZE = 26;
export const PSL_MARK_FONT_WEIGHT = 800;
export const PSL_MARK_LETTER_SPACING = "0.08em";
export const PSL_MARK_FONT_FAMILY =
  "Arial, Helvetica, 'Helvetica Neue', sans-serif";
/** Optical vertical center of the letter block (above the accent). */
export const PSL_MARK_TEXT_Y = 30;
/** Accent sits under the full wordmark with even side insets. */
export const PSL_MARK_ACCENT = {
  x: 11,
  y: 50,
  width: 42,
  height: 2.5,
  rx: 1.25,
} as const;

type MarkA11y =
  | { decorative: true }
  | { decorative?: false; titleId: string };

/**
 * Single SVG source for the PSL mark used in header, footer, and gate.
 * One text node — equal cap height, weight, and spacing for P/S/L.
 */
export function PslMarkSvg({
  size,
  className,
  ...a11y
}: { size: number; className?: string } & MarkA11y) {
  const decorative = a11y.decorative === true;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${PSL_MARK_VIEWBOX} ${PSL_MARK_VIEWBOX}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-labelledby={decorative ? undefined : a11y.titleId}
    >
      {!decorative && <title id={a11y.titleId}>PSL Labs</title>}
      <rect
        width={PSL_MARK_VIEWBOX}
        height={PSL_MARK_VIEWBOX}
        rx={PSL_MARK_RADIUS}
        fill={PSL_MARK.navy}
      />
      <text
        x={PSL_MARK_VIEWBOX / 2}
        y={PSL_MARK_TEXT_Y}
        textAnchor="middle"
        dominantBaseline="central"
        fill={PSL_MARK.white}
        fontFamily={PSL_MARK_FONT_FAMILY}
        fontSize={PSL_MARK_FONT_SIZE}
        fontWeight={PSL_MARK_FONT_WEIGHT}
        letterSpacing={PSL_MARK_LETTER_SPACING}
      >
        PSL
      </text>
      <rect
        x={PSL_MARK_ACCENT.x}
        y={PSL_MARK_ACCENT.y}
        width={PSL_MARK_ACCENT.width}
        height={PSL_MARK_ACCENT.height}
        rx={PSL_MARK_ACCENT.rx}
        fill={PSL_MARK.ice}
        opacity={0.9}
      />
    </svg>
  );
}

/**
 * Same mark for next/og ImageResponse (Satori). Flex-centered text so
 * P/S/L share one font-size and weight — no per-letter scaling.
 */
export function PslMarkImage({
  size,
  border,
}: {
  size: number;
  border?: string;
}) {
  const radius = Math.round((size * PSL_MARK_RADIUS) / PSL_MARK_VIEWBOX);
  const fontSize = Math.round((size * PSL_MARK_FONT_SIZE) / PSL_MARK_VIEWBOX);
  const accentHeight = Math.max(
    2,
    Math.round((size * PSL_MARK_ACCENT.height) / PSL_MARK_VIEWBOX)
  );
  const accentInset = Math.round((size * PSL_MARK_ACCENT.x) / PSL_MARK_VIEWBOX);
  const accentBottom = Math.round(
    (size * (PSL_MARK_VIEWBOX - PSL_MARK_ACCENT.y - PSL_MARK_ACCENT.height)) /
      PSL_MARK_VIEWBOX
  );
  // Nudge letters slightly up so the accent doesn't make the block feel bottom-heavy.
  const textLift = Math.round(size * 0.03);

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: PSL_MARK.navy,
        borderRadius: radius,
        position: "relative",
        border: border ?? "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: PSL_MARK.white,
          fontSize,
          fontWeight: PSL_MARK_FONT_WEIGHT,
          letterSpacing: PSL_MARK_LETTER_SPACING,
          fontFamily: PSL_MARK_FONT_FAMILY,
          lineHeight: 1,
          marginBottom: textLift,
        }}
      >
        PSL
      </div>
      <div
        style={{
          position: "absolute",
          bottom: accentBottom,
          left: accentInset,
          right: accentInset,
          height: accentHeight,
          background: PSL_MARK.ice,
          borderRadius: Math.ceil(accentHeight / 2),
        }}
      />
    </div>
  );
}
