import { ImageResponse } from "next/og";

import { PslMarkImage } from "@/components/branding/psl-mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon / app icon — same PslMarkImage geometry as Apple + OG. */
export default function Icon() {
  return new ImageResponse(<PslMarkImage size={32} />, { ...size });
}
