const path = require("path");
const { loadEnvConfig } = require("@next/env");

// Next only auto-loads .env* from apps/storefront. Load repo-root .env too so SMTP/SendGrid
// keys can live alongside the rest of the deploy config.
const repoRoot = path.join(__dirname, "../..");
loadEnvConfig(repoRoot);
loadEnvConfig(__dirname);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gemini Live (browser WebSocket) needs a public key; Docker often only sets GOOGLE_AI_API_KEY.
  env: {
    NEXT_PUBLIC_GOOGLE_AI_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY || "",
  },
  output: "standalone",
  transpilePackages: ["@blessluxe/ui"],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9001',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9001',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'shop',
        port: '9001',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
