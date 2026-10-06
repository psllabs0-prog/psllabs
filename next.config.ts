import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
