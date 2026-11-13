import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Type checking and linting run separately (`npm run typecheck`, `npm run lint`).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
