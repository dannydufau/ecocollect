import type { NextConfig } from "next";

const gatewayUrl = process.env.GATEWAY_URL ?? "http://localhost:8080";

// The signed-in test mode skips Firebase, so it must be asked for twice and never be built by accident.
const e2e = process.env.NEXT_PUBLIC_E2E === "true";
if (e2e && process.env.E2E_BUILD_CONFIRM !== "1") {
  throw new Error("NEXT_PUBLIC_E2E skips Firebase sign-in. Use `npm run e2e:app`, and never set it for a deployed build.");
}

const nextConfig: NextConfig = {
  // Always set, so a normal build gets "false" baked in and the test-only code is dropped from it
  env: { NEXT_PUBLIC_E2E: String(e2e) },
  // Its own folder, so a test build never replaces the normal .next output
  ...(e2e && { distDir: ".next-e2e" }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${gatewayUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;