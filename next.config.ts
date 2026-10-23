import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'" },
        ],
      },
      {
        source: "/:path(admin(?:-.*)?)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'" },
        ],
      },
      {
        source: "/admin-ledger.01",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/products/glp-3-rt",
        destination: "/products/psl-rt-10mg",
        permanent: true,
      },
      {
        source: "/products/retatrutide",
        destination: "/products/psl-rt-10mg",
        permanent: true,
      },
      {
        source: "/products/ghk-cu",
        destination: "/products/psl-ghkcu-50mg",
        permanent: true,
      },
      {
        source: "/products/bpc-157",
        destination: "/products/psl-bpc157-10mg",
        permanent: true,
      },
      {
        source: "/products/tesamorelin",
        destination: "/products/psl-tesa-10mg",
        permanent: true,
      },
      {
        source: "/products/reconstitution-solution",
        destination: "/products/psl-rs-5ml",
        permanent: true,
      },
      // Legacy label art: send old links and image-search hits for the original label files
      // to the current "BATCH REPORT ONLINE" art without deleting the files.
      // Temporary (307), so the originals can be restored.
      {
        source: "/Retatrutide-transparent.png",
        destination: "/products/retatrutide-transparent-batch.png",
        permanent: false,
      },
      {
        source: "/products/bpc-157-transparent.png",
        destination: "/products/renders/bpc-157-cutout.webp",
        permanent: false,
      },
      {
        source: "/products/ghk-cu-transparent.png",
        destination: "/products/renders/ghk-cu-cutout.webp",
        permanent: false,
      },
      {
        source: "/products/tesamorelin-transparent.png",
        destination: "/products/renders/tesamorelin-cutout.webp",
        permanent: false,
      },
      {
        source: "/products/reconstitution-solution.png",
        destination: "/products/renders/reconstitution-solution-cutout.webp",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
