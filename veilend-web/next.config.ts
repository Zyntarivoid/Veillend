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

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
