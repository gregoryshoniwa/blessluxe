/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@blessluxe/ui"],
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    NEXT_PUBLIC_SHOP_BACKEND:
      process.env.NEXT_PUBLIC_SHOP_BACKEND || "http://localhost:9001",
  },
};

module.exports = nextConfig;
