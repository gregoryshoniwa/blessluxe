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
