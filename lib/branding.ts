/**
 * Brand colors, logo assets and site metadata strings.
 * Logo derivatives are generated from public/branding/psl-logo-source.png
 * by scripts/generate-brand-assets.ts.
 */
export const PSL_BRAND = {
  black: "#000000",
  cyan: "#20B4EC",
} as const;

export const SITE_TITLE =
  "PSL Labs: Synthetic Peptides for Laboratory Research";
export const SITE_DESCRIPTION =
  "Synthetic peptides for laboratory research. Third-party lab reports available for released lots.";

/** Default 1200x630 social preview (blue-on-black PSL logo). */
export const DEFAULT_SHARE_IMAGE = {
  url: "/branding/psl-og.png",
  width: 1200,
  height: 630,
  alt: SITE_TITLE,
  type: "image/png",
} as const;
