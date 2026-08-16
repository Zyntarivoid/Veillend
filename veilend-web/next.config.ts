import type { NextConfig } from "next";
import { validateConfig } from "./src/lib/config-validation";

/**
 * Run startup config validation before Next.js processes the rest of the
 * config.  This ensures contributors see a clear, actionable error listing
 * all missing/invalid environment variables at `next dev` / `next build` time
 * rather than cryptic runtime failures deep inside the app.
 *
 * All variables have safe defaults for testnet, so the app starts without any
 * .env.local file.  See .env.example for the full list of variables.
 */
validateConfig();

const isProd = process.env.NODE_ENV === "production";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL || "";
const sorobanUrl = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || "";

const fallbackCsp = [
  `default-src 'self'`,
  isProd
    ? `script-src 'self' https: 'strict-dynamic'`
    : `script-src 'self' 'unsafe-eval' 'unsafe-inline'`,
  isProd ? `style-src 'self'` : `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: https:`,
  `connect-src 'self' ${apiUrl} ${horizonUrl} ${sorobanUrl}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: fallbackCsp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;