// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletProvider } from "@/context/WalletContext";
import { WalletConnect } from "./WalletConnect";

// Keep the real wallet helpers; only pin installation to "true" so the
// disconnected trigger (rather than an install prompt) is rendered.
vi.mock("@/lib/stellar/wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stellar/wallet")>();
  return { ...actual, isFreighterInstalled: () => true };
});

describe("WalletConnect trigger", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderComponent = () =>
    render(
      <WalletProvider>
        <WalletConnect />
      </WalletProvider>
    );

  it("exposes dialog semantics and an accessible name on the trigger", () => {
    renderComponent();

    const trigger = screen.getByRole("button", { name: /connect wallet/i });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBe("wallet-connect-dialog");
  });

  it("opens the dialog on click and reflects aria-expanded", async () => {
    const user = userEvent.setup();
    renderComponent();

    const trigger = screen.getByRole("button", { name: /connect wallet/i });
    await user.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).toContain("Connect Wallet");
  });

  it("activates the trigger via the keyboard (Enter)", async () => {
    const user = userEvent.setup();
    renderComponent();

    const trigger = screen.getByRole("button", { name: /connect wallet/i });
    trigger.focus();
    await user.keyboard("{Enter}");

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
