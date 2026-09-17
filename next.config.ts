import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  output: "standalone",
  devIndicators: false,
  allowedDevOrigins: ["192.168.1.106", "127.0.0.1"],
  serverExternalPackages: ["@prisma/client", "sharp", "playwright-core", "mupdf"],
};

export default nextConfig;
