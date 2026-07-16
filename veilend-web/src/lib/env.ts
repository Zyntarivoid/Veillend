const ALLOWED_STELLAR_NETWORKS = ["testnet", "mainnet"] as const;

type StellarNetwork = (typeof ALLOWED_STELLAR_NETWORKS)[number];

type PublicEnv = {
  NEXT_PUBLIC_API_URL: string;
  NEXT_PUBLIC_STELLAR_NETWORK: StellarNetwork;
  NEXT_PUBLIC_HORIZON_URL: string;
  NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: string;
};

const EXPECTED_PASSPHRASES: Record<StellarNetwork, string> = {
  testnet: "Test SDF Network ; September 2015",
  mainnet: "Public Global Stellar Network ; September 2015",
};

let cachedEnv: PublicEnv | undefined;

function readEnv(name: keyof PublicEnv): string {
  return process.env[name]?.trim() ?? "";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validatePublicEnv(): PublicEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const env = {
    NEXT_PUBLIC_API_URL: readEnv("NEXT_PUBLIC_API_URL"),
    NEXT_PUBLIC_STELLAR_NETWORK: readEnv("NEXT_PUBLIC_STELLAR_NETWORK"),
    NEXT_PUBLIC_HORIZON_URL: readEnv("NEXT_PUBLIC_HORIZON_URL"),
    NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: readEnv(
      "NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE",
    ),
  };

  const errors: string[] = [];

  if (!env.NEXT_PUBLIC_API_URL) {
    errors.push("NEXT_PUBLIC_API_URL is required.");
  } else if (!isHttpUrl(env.NEXT_PUBLIC_API_URL)) {
    errors.push("NEXT_PUBLIC_API_URL must be a valid http:// or https:// URL.");
  }

  if (!env.NEXT_PUBLIC_STELLAR_NETWORK) {
    errors.push("NEXT_PUBLIC_STELLAR_NETWORK is required.");
  } else if (
    !ALLOWED_STELLAR_NETWORKS.includes(
      env.NEXT_PUBLIC_STELLAR_NETWORK as StellarNetwork,
    )
  ) {
    errors.push(
      `NEXT_PUBLIC_STELLAR_NETWORK must be one of: ${ALLOWED_STELLAR_NETWORKS.join(", ")}.`,
    );
  }

  if (!env.NEXT_PUBLIC_HORIZON_URL) {
    errors.push("NEXT_PUBLIC_HORIZON_URL is required.");
  } else if (!isHttpUrl(env.NEXT_PUBLIC_HORIZON_URL)) {
    errors.push("NEXT_PUBLIC_HORIZON_URL must be a valid http:// or https:// URL.");
  }

  if (!env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE) {
    errors.push("NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE is required.");
  }

  const network = env.NEXT_PUBLIC_STELLAR_NETWORK as StellarNetwork;
  const expectedPassphrase = EXPECTED_PASSPHRASES[network];

  if (
    expectedPassphrase &&
    env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE &&
    env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE !== expectedPassphrase
  ) {
    errors.push(
      `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE does not match the expected passphrase for ${network}.`,
    );
  }

  if (errors.length > 0) {
    throw new Error(
      [
        "Invalid VeilLend web environment configuration:",
        ...errors.map((error) => `- ${error}`),
        "",
        "Copy `.env.example` to `.env.local` in `veilend-web/` and update the values before starting the app.",
      ].join("\n"),
    );
  }

  cachedEnv = {
    NEXT_PUBLIC_API_URL: env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_STELLAR_NETWORK: network,
    NEXT_PUBLIC_HORIZON_URL: env.NEXT_PUBLIC_HORIZON_URL,
    NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE:
      env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE,
  };

  return cachedEnv;
}

export const publicEnv = validatePublicEnv();
