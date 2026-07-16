/**
 * Startup configuration validation for VeilLend Web.
 *
 * Call `validateConfig()` once at build/startup time (e.g. from next.config.ts)
 * so that missing or invalid environment variables are surfaced immediately
 * with a clear, actionable error rather than a cryptic runtime failure.
 *
 * All four variables have safe defaults for local development on testnet, so
 * the app can start without any `.env.local` file.  Explicit values are only
 * required when deploying to mainnet or a custom network.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** The set of validated, typed config values available at runtime. */
export interface AppConfig {
  stellarNetwork: "testnet" | "mainnet" | "futurenet";
  horizonUrl: string;
  networkPassphrase: string;
  apiUrl: string;
}

/** A single validation failure. */
interface ValidationError {
  variable: string;
  value: string | undefined;
  message: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_NETWORKS = ["testnet", "mainnet", "futurenet"] as const;
type StellarNetwork = (typeof VALID_NETWORKS)[number];

const DEFAULTS: Record<string, string> = {
  NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
  NEXT_PUBLIC_HORIZON_URL: "https://horizon-testnet.stellar.org",
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  NEXT_PUBLIC_API_URL: "http://localhost:3001",
};

// ─── Validators ───────────────────────────────────────────────────────────────

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidStellarNetwork(value: string): value is StellarNetwork {
  return (VALID_NETWORKS as readonly string[]).includes(value);
}

// ─── Core validation ──────────────────────────────────────────────────────────

/**
 * Resolve an env var, falling back to the built-in default when the variable
 * is absent or empty.
 */
function resolve(key: string): string {
  const raw = process.env[key];
  return (raw && raw.trim()) ? raw.trim() : (DEFAULTS[key] ?? "");
}

/**
 * Validate all environment variables and return a typed `AppConfig`.
 *
 * Throws a single, formatted error listing every problem found so contributors
 * can fix all issues in one go rather than discovering them one by one.
 */
export function validateConfig(): AppConfig {
  const errors: ValidationError[] = [];

  // ── NEXT_PUBLIC_STELLAR_NETWORK ────────────────────────────────────────────
  const stellarNetwork = resolve("NEXT_PUBLIC_STELLAR_NETWORK");

  if (!isValidStellarNetwork(stellarNetwork)) {
    errors.push({
      variable: "NEXT_PUBLIC_STELLAR_NETWORK",
      value: stellarNetwork,
      message: `Must be one of: ${VALID_NETWORKS.join(", ")}. Got: "${stellarNetwork}"`,
    });
  }

  // ── NEXT_PUBLIC_HORIZON_URL ────────────────────────────────────────────────
  const horizonUrl = resolve("NEXT_PUBLIC_HORIZON_URL");

  if (!isValidUrl(horizonUrl)) {
    errors.push({
      variable: "NEXT_PUBLIC_HORIZON_URL",
      value: horizonUrl,
      message: `Must be a valid http/https URL. Got: "${horizonUrl}"`,
    });
  }

  // ── NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ─────────────────────────────────
  const networkPassphrase = resolve("NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE");

  if (!networkPassphrase) {
    errors.push({
      variable: "NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE",
      value: networkPassphrase,
      message: "Must not be empty.",
    });
  }

  // ── NEXT_PUBLIC_API_URL ────────────────────────────────────────────────────
  const apiUrl = resolve("NEXT_PUBLIC_API_URL");

  if (!isValidUrl(apiUrl)) {
    errors.push({
      variable: "NEXT_PUBLIC_API_URL",
      value: apiUrl,
      message: `Must be a valid http/https URL. Got: "${apiUrl}"`,
    });
  }

  // ── Report all errors at once ──────────────────────────────────────────────
  if (errors.length > 0) {
    const lines = [
      "",
      "╔══════════════════════════════════════════════════════════╗",
      "║   VeilLend — invalid or missing environment variables    ║",
      "╚══════════════════════════════════════════════════════════╝",
      "",
      "The following configuration problems were detected:",
      "",
      ...errors.map(
        (e, i) =>
          `  ${i + 1}. ${e.variable}\n     → ${e.message}`,
      ),
      "",
      "Fix these values in .env.local (copy .env.example to get started):",
      "",
      "  cp .env.example .env.local",
      "",
      "See veilend-web/README.md § Environment Variables for full documentation.",
      "",
    ];

    throw new Error(lines.join("\n"));
  }

  // ── Return typed config ────────────────────────────────────────────────────
  return {
    stellarNetwork: stellarNetwork as StellarNetwork,
    horizonUrl,
    networkPassphrase,
    apiUrl,
  };
}

/**
 * Cached, validated configuration.
 *
 * Import this anywhere in the codebase to access config values with the
 * guarantee that they have already passed validation at startup.
 *
 * NOTE: This is evaluated at module-load time on the server (during
 * `next build` / `next start`).  On the client side Next.js inlines
 * NEXT_PUBLIC_ values at build time, so no validation is needed there.
 */
let _config: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = validateConfig();
  }
  return _config;
}
