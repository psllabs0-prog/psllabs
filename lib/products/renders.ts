/** Illustrative studio renders. Original packaging artwork remains in images.ts. */
const renders: Record<string, { src: string; alt: string }> = {
  retatrutide: { src: "/products/renders/retatrutide-studio.webp", alt: "Illustrative studio render of the PSL Labs Retatrutide 10 mg vial" },
  "ghk-cu": { src: "/products/renders/ghk-cu-studio.webp", alt: "Illustrative studio render of the PSL Labs GHK-Cu 50 mg vial" },
  "bpc-157": { src: "/products/renders/bpc-157-studio.webp", alt: "Illustrative studio render of the PSL Labs BPC-157 10 mg vial" },
  tesamorelin: { src: "/products/renders/tesamorelin-studio.webp", alt: "Illustrative PSL Labs Tesamorelin 10 mg vial with corrected batch-report label; physical packaging may differ" },
  "reconstitution-solution": { src: "/products/renders/reconstitution-solution-studio.webp", alt: "Illustrative PSL Labs Reconstitution Solution 5 ml vial with corrected batch-report label; physical packaging may differ" },
};

export function getProductRender(handle: string) {
  return renders[handle];
}
