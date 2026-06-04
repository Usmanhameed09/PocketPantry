import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /help page reads markdown files from docs/SOPs/ at request time.
  // Without this includes hint, Vercel's output file tracing wouldn't bundle
  // them and prod would return an empty list.
  outputFileTracingIncludes: {
    "/help": ["./docs/SOPs/*.md"],
  },
};

export default nextConfig;
