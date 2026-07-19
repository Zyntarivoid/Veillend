import { describe, expect, it } from "vitest";
import { getWalletConnectionMessage } from "./wallet";

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
