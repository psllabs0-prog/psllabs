export const PRODUCT_VIAL_IMAGE = {
  src: "/Retatrutide-transparent.png",
  alt: "Retatrutide research peptide vial",
} as const;

/** Opaque gradient — eliminates checkerboard behind transparent PNGs */
export const PRODUCT_CARD_GRADIENT =
  "bg-gradient-to-br from-biotech-pale via-lab-white to-biotech-mist";

export const PRODUCT_CARD_RADIAL =
  "bg-[radial-gradient(ellipse_80%_65%_at_50%_42%,rgba(123,175,212,0.18),transparent)]";

/** Semantic contexts — vial renders same visual size in every `card` */
export type ProductVialContext = "thumb" | "card" | "product" | "hero";

export const VIAL_CONTEXT_CONFIG: Record<
  ProductVialContext,
  { padding: string; vialMax: string; sizes: string }
> = {
  thumb: {
    padding: "p-3",
    vialMax: "max-w-[64px]",
    sizes: "64px",
  },
  card: {
    padding: "p-10 md:p-12",
    vialMax: "max-w-[200px]",
    sizes: "200px",
  },
  product: {
    padding: "p-12 md:p-14 lg:p-16",
    vialMax: "max-w-[440px]",
    sizes: "(max-width: 768px) 78vw, 440px",
  },
  hero: {
    padding: "p-12 md:p-14 lg:p-16",
    vialMax: "max-w-[460px]",
    sizes: "(max-width: 1024px) 85vw, 460px",
  },
};
