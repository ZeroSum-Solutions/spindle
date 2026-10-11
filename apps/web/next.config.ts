import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/lib/csp";

const csp = contentSecurityPolicy({
  dev: process.env.NODE_ENV === "development",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: csp }] }];
  },
};

export default nextConfig;
