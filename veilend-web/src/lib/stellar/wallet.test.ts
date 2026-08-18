import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWalletConnectionMessage, signMessage } from "./wallet";
import { getAddress, signMessage as freighterSignMessage } from "@stellar/freighter-api";

const TEST_ADDRESS = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(),
  getAddress: vi.fn(),
  signMessage: vi.fn(),
}));

describe("getWalletConnectionMessage", () => {
  it("returns retry and cancel actions for recoverable wallet errors", () => {
    const message = getWalletConnectionMessage(
      "Freighter is not connected. Please unlock your wallet.",
      true
    );

    expect(message.title).toContain("Wallet");
    expect(message.description.toLowerCase()).toContain("unlock");
    expect(message.primaryAction).toBe("Try again");
    expect(message.secondaryAction).toBe("Cancel");
    expect(message.isRetryable).toBe(true);
  });

  it("provides install guidance when the extension is unavailable", () => {
    const message = getWalletConnectionMessage(null, false);

    expect(message.title).toContain("Freighter");
    expect(message.description).toContain("Install");
    expect(message.primaryAction).toBe("Connect");
    expect(message.secondaryAction).toBe("Cancel");
    expect(message.isRetryable).toBe(false);
  });
});

describe("signMessage", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { freighter: {} };
    vi.mocked(getAddress).mockResolvedValue({
      address: TEST_ADDRESS,
    } as never);
  });

  it("returns the base64 signature produced by the wallet", async () => {
    vi.mocked(freighterSignMessage).mockResolvedValue({
      signedMessage: "c2lnbmF0dXJl",
      signerAddress: TEST_ADDRESS,
    } as never);

    const signature = await signMessage("nonce-123", TEST_ADDRESS);

    expect(signature).toBe("c2lnbmF0dXJl");
    expect(freighterSignMessage).toHaveBeenCalledWith("nonce-123", {
      address: TEST_ADDRESS,
    });
  });

  it("returns null when the user does not submit a signature", async () => {
    vi.mocked(freighterSignMessage).mockResolvedValue({
      signedMessage: null,
      signerAddress: "",
    } as never);

    const signature = await signMessage("nonce-123", TEST_ADDRESS);

    expect(signature).toBeNull();
  });
});
