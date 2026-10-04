import Image from "next/image";

import pslLogo from "@/public/branding/psl-logo-web.png";
import { cn } from "@/lib/utils";

export type PSLLogoProps = {
  /** Rendered height in CSS pixels; width follows the artwork's aspect ratio. */
  height?: number;
  className?: string;
  /** When true, logo is decorative (parent supplies accessible name). */
  decorative?: boolean;
  /** Load immediately (above-the-fold placements such as the header). */
  eager?: boolean;
};

/**
 * Approved PSL lockup (cyan DNA + "PSL"), cropped from
 * public/branding/psl-logo-source.png by scripts/generate-brand-assets.ts.
 */
export function PSLLogo({
  height = 32,
  className,
  decorative = false,
  eager = false,
}: PSLLogoProps) {
  const width = Math.round((pslLogo.width * height) / pslLogo.height);

  return (
    <Image
      src={pslLogo}
      alt={decorative ? "" : "PSL Labs"}
      width={width}
      height={height}
      loading={eager ? "eager" : "lazy"}
      className={cn("block shrink-0", className)}
      style={{ width, height }}
    />
  );
}
