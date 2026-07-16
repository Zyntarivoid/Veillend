import type { NextConfig } from "next";
import { validatePublicEnv } from "./src/lib/env";

validatePublicEnv();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
