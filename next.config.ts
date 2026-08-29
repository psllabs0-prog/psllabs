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
    ];
  },
};

export default nextConfig;
