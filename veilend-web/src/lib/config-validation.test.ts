import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getConfig,
  resetConfigCache,
  validateConfig,
} from "./config-validation";

const MANAGED_KEYS = [
  "NEXT_PUBLIC_STELLAR_NETWORK",
  "NEXT_PUBLIC_HORIZON_URL",
  "NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE",
  "NEXT_PUBLIC_API_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(MANAGED_KEYS.map((k) => [k, process.env[k]]));
  for (const key of MANAGED_KEYS) delete process.env[key];
  resetConfigCache();
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetConfigCache();
});

/** Capture the thrown banner so assertions can read its text. */
function expectBanner(): string {
  let message: string | undefined;
  try {
    validateConfig();
  } catch (error) {
    message = (error as Error).message;
  }
  expect(message, "expected validateConfig() to throw").toBeDefined();
  return message as string;
}

describe("defaults", () => {
  it("produces a valid config with an empty environment", () => {
    const config = validateConfig();

    expect(config).toEqual({
      stellarNetwork: "testnet",
      horizonUrl: "https://horizon-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
      apiUrl: "http://localhost:3001",
      siteUrl: "http://localhost:3000",
    });
  });

  it("falls back to the default when a variable is set but blank", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";

    expect(validateConfig().siteUrl).toBe("http://localhost:3000");
  });
});

describe("NEXT_PUBLIC_STELLAR_NETWORK", () => {
  it("rejects an unknown network and lists the valid ones", () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "banana";

    const banner = expectBanner();

    expect(banner).toContain("NEXT_PUBLIC_STELLAR_NETWORK");
    expect(banner).toContain("testnet, mainnet, futurenet");
    expect(banner).toContain('"banana"');
  });

  it("accepts every supported network", () => {
    for (const network of ["testnet", "mainnet", "futurenet"] as const) {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = network;
      // mainnet forbids the localhost defaults, so supply real origins.
      process.env.NEXT_PUBLIC_API_URL = "https://api.veilend.example";
      process.env.NEXT_PUBLIC_SITE_URL = "https://veilend.example";

      expect(validateConfig().stellarNetwork).toBe(network);
    }
  });
});

describe("NEXT_PUBLIC_SITE_URL", () => {
  it("returns a valid override on config.siteUrl", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://veilend.example";

    expect(validateConfig().siteUrl).toBe("https://veilend.example");
  });

  it("rejects a malformed URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not a url";

    expect(expectBanner()).toContain("NEXT_PUBLIC_SITE_URL");
  });
});

describe("URL hardening", () => {
  it("rejects embedded credentials", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://user:pass@example.com";

    expect(expectBanner()).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("rejects a username without a password", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://user@example.com";

    expect(expectBanner()).toContain("NEXT_PUBLIC_API_URL");
  });

  it.each(["javascript:alert(1)", "ftp://example.com", "file:///etc/hosts"])(
    "rejects the non-http protocol %s",
    (value) => {
      process.env.NEXT_PUBLIC_SITE_URL = value;

      expect(expectBanner()).toContain("NEXT_PUBLIC_SITE_URL");
    },
  );
});

describe("localhost rules", () => {
  it("allows localhost on testnet", () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:3001";

    expect(validateConfig().apiUrl).toBe("http://127.0.0.1:3001");
  });

  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])(
    "rejects %s on mainnet",
    (value) => {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = "mainnet";
      process.env.NEXT_PUBLIC_API_URL = "https://api.veilend.example";
      process.env.NEXT_PUBLIC_SITE_URL = value;

      const banner = expectBanner();

      expect(banner).toContain("NEXT_PUBLIC_SITE_URL");
      expect(banner).toContain("mainnet");
    },
  );

  it("flags the localhost defaults when only the network is switched to mainnet", () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "mainnet";

    const banner = expectBanner();

    expect(banner).toContain("NEXT_PUBLIC_API_URL");
    expect(banner).toContain("NEXT_PUBLIC_SITE_URL");
    // Horizon's default is a real https origin, so it must stay clean.
    expect(banner).not.toContain("NEXT_PUBLIC_HORIZON_URL");
  });

  it("does not cascade an invalid network into spurious localhost errors", () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "banana";

    const banner = expectBanner();

    expect(banner).toContain("1. NEXT_PUBLIC_STELLAR_NETWORK");
    expect(banner).not.toContain("2. ");
  });
});

describe("error reporting", () => {
  it("lists every simultaneous failure in one banner", () => {
    process.env.NEXT_PUBLIC_HORIZON_URL = "nope";
    process.env.NEXT_PUBLIC_API_URL = "javascript:alert(1)";
    process.env.NEXT_PUBLIC_SITE_URL = "https://user:pass@example.com";

    const banner = expectBanner();

    expect(banner).toContain("1. NEXT_PUBLIC_HORIZON_URL");
    expect(banner).toContain("2. NEXT_PUBLIC_API_URL");
    expect(banner).toContain("3. NEXT_PUBLIC_SITE_URL");
  });

  it("keeps the passphrase on its default rather than reporting it blank", () => {
    // `resolve()` treats a whitespace-only value as absent, so the empty-string
    // guard on the passphrase is defensive only — it cannot fire while the
    // variable has a built-in default.
    process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE = "   ";

    expect(validateConfig().networkPassphrase).toBe(
      "Test SDF Network ; September 2015",
    );
  });

  it("renders the offending value alongside the rule", () => {
    process.env.NEXT_PUBLIC_HORIZON_URL = "nope";

    expect(expectBanner()).toContain('value: "nope"');
  });
});

describe("getConfig", () => {
  it("caches the first validated result", () => {
    const first = getConfig();
    process.env.NEXT_PUBLIC_SITE_URL = "https://veilend.example";

    expect(getConfig()).toBe(first);
    expect(getConfig().siteUrl).toBe("http://localhost:3000");
  });

  it("re-reads the environment after resetConfigCache()", () => {
    getConfig();
    process.env.NEXT_PUBLIC_SITE_URL = "https://veilend.example";
    resetConfigCache();

    expect(getConfig().siteUrl).toBe("https://veilend.example");
  });
});
