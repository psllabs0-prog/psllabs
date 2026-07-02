import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/products/glp-3-rt",
        destination: "/products/retatrutide",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
