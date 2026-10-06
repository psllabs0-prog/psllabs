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
    ];
  },
};

export default nextConfig;
