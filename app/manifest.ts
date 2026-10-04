import type { MetadataRoute } from "next";

import { PSL_BRAND, SITE_DESCRIPTION } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PSL Labs",
    short_name: "PSL Labs",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "browser",
    background_color: PSL_BRAND.black,
    theme_color: PSL_BRAND.black,
    icons: [
      {
        src: "/branding/psl-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/branding/psl-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
