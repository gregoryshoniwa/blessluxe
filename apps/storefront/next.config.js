const path = require("path");
const { loadEnvConfig } = require("@next/env");

// Next only auto-loads .env* from apps/storefront. Medusa/monorepo SMTP lives in repo root — load both so
// /api/agent and send_email see SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM (same as backend).
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
        port: '9000',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '9000',
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
