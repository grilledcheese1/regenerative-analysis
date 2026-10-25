import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API routes read cached routes and trips from data/ at runtime; make sure they are bundled into the serverless output.
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/cache/routes/**/*", "./data/trips/**/*"],
  },
};

export default nextConfig;
