/**
 * Startup configuration validation for VeilLend Web.
 *
 * Call `validateConfig()` once at build/startup time (e.g. from next.config.ts)
 * so that missing or invalid environment variables are surfaced immediately
 * with a clear, actionable error rather than a cryptic runtime failure.
 *
 * All five variables have safe defaults for local development on testnet, so
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
  siteUrl: string;
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
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

/**
 * Hostnames that resolve to the developer's own machine.  Allowed on every
 * network except mainnet, where they are almost always a copy/paste mistake
 * that would ship a dead API origin (or a dead canonical URL) to production.
 *
 * `[::1]` is listed alongside `::1` because WHATWG `URL` keeps the brackets on
 * `hostname` for IPv6 literals (`new URL("http://[::1]").hostname === "[::1]"`).
 */
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// ─── Validators ───────────────────────────────────────────────────────────────

interface UrlOptions {
  /** When false, hostnames pointing at the local machine are rejected. */
  allowLocalhost?: boolean;
}

function isValidUrl(value: string, opts: UrlOptions = {}): boolean {
  const { allowLocalhost = true } = opts;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  // Embedded credentials would be inlined into the browser bundle by Next.js,
  // so treat them as a hard error rather than silently leaking them.
  if (url.username || url.password) return false;

  // Defensive invariant only: `http:`/`https:` URLs cannot parse with an empty
  // hostname (`http://:3000` throws, `http:///foo` normalises to host "foo"),
  // so this is unreachable given the protocol check above.
  if (!url.hostname) return false;

  if (!allowLocalhost && LOCAL_HOSTNAMES.has(url.hostname.toLowerCase())) {
    return false;
  }

  return true;
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
  // Resolved first because the URL rules below depend on the target network.
  const stellarNetwork = resolve("NEXT_PUBLIC_STELLAR_NETWORK");

  if (!isValidStellarNetwork(stellarNetwork)) {
    errors.push({
      variable: "NEXT_PUBLIC_STELLAR_NETWORK",
      value: stellarNetwork,
      message: `Must be one of: ${VALID_NETWORKS.join(", ")}.`,
    });
  }

  // An *invalid* network must not cascade into spurious localhost errors: an
  // unrecognised value is not mainnet, so localhost stays permitted and the
  // contributor sees only the one error they actually have to fix.
  const allowLocalhost = stellarNetwork !== "mainnet";
  const urlOpts: UrlOptions = { allowLocalhost };
  const localhostNote = allowLocalhost
    ? ""
    : " Localhost addresses are not allowed when NEXT_PUBLIC_STELLAR_NETWORK=mainnet.";

  // ── NEXT_PUBLIC_HORIZON_URL ────────────────────────────────────────────────
  const horizonUrl = resolve("NEXT_PUBLIC_HORIZON_URL");

  if (!isValidUrl(horizonUrl, urlOpts)) {
    errors.push({
      variable: "NEXT_PUBLIC_HORIZON_URL",
      value: horizonUrl,
      message: `Must be a valid http/https URL without embedded credentials.${localhostNote}`,
    });
  }

  // ── NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ─────────────────────────────────
  // Defensive only: `resolve()` substitutes the default for a blank value, so
  // this cannot fire while the variable has an entry in DEFAULTS.
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

  if (!isValidUrl(apiUrl, urlOpts)) {
    errors.push({
      variable: "NEXT_PUBLIC_API_URL",
      value: apiUrl,
      message: `Must be a valid http/https URL without embedded credentials.${localhostNote}`,
    });
  }

  // ── NEXT_PUBLIC_SITE_URL ───────────────────────────────────────────────────
  // Canonical public origin: feeds `metadataBase`, robots.txt, sitemap.xml and
  // the JSON-LD blocks, so a bad value silently poisons every absolute URL.
  const siteUrl = resolve("NEXT_PUBLIC_SITE_URL");

  if (!isValidUrl(siteUrl, urlOpts)) {
    errors.push({
      variable: "NEXT_PUBLIC_SITE_URL",
      value: siteUrl,
      message: `Must be a valid http/https URL without embedded credentials.${localhostNote}`,
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
          `  ${i + 1}. ${e.variable}\n` +
          `     value: ${e.value === undefined ? "(not set)" : JSON.stringify(e.value)}\n` +
          `     → ${e.message}`,
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
    siteUrl,
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

/**
 * Drop the cached config so the next `getConfig()` re-reads `process.env`.
 * Intended for tests that mutate the environment between cases.
 */
export function resetConfigCache(): void {
  _config = undefined;
}
