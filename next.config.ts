import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    cpus: 1,
  },
  webpack: (config) => {
    config.parallelism = 1;
    return config;
  },
};

export default nextConfig;
