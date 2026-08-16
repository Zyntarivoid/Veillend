// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletSessionAlert } from "./WalletSessionAlert";

const ROTATED_ADDRESS = "GDJ7OQZZ7I6YFNO3GVWJQN6FXTWY3QJ6VYGDFTX5Y6M6V7GKP7CJGHVJ";

const mocks = vi.hoisted(() => ({
  healthStatus: "healthy" as string,
  freighterAddress: null as string | null,
  reconnect: vi.fn(),
  switchToNewWallet: vi.fn(),
  keepOldSession: vi.fn(),
}));

vi.mock("@/context/WalletContext", () => ({
  useWallet: () => ({
    healthStatus: mocks.healthStatus,
    freighterAddress: mocks.freighterAddress,
    reconnect: mocks.reconnect,
    switchToNewWallet: mocks.switchToNewWallet,
    keepOldSession: mocks.keepOldSession,
  }),
}));

describe("WalletSessionAlert", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing while healthy", () => {
    mocks.healthStatus = "healthy";

    const { container } = render(<WalletSessionAlert />);

    expect(container.firstChild).toBeNull();
  });

  it("shows the unavailable warning with a working reconnect CTA", async () => {
    const user = userEvent.setup();
    mocks.healthStatus = "unavailable";

    render(<WalletSessionAlert />);

    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain(
      "Wallet unavailable — please unlock Freighter and reconnect"
    );

    await user.click(screen.getByRole("button", { name: /reconnect/i }));
    expect(mocks.reconnect).toHaveBeenCalled();
  });

  it("shows the session expiry toast with a reconnect CTA", () => {
    mocks.healthStatus = "session-expired";

    render(<WalletSessionAlert />);

    const toast = screen.getByRole("alert");
    expect(toast.textContent).toContain("Session expired. Please reconnect.");
    expect(toast.getAttribute("aria-live")).toBe("assertive");
    expect(screen.getByRole("button", { name: /reconnect/i })).toBeTruthy();
  });

  it("offers switch and keep choices on address rotation", async () => {
    const user = userEvent.setup();
    mocks.healthStatus = "address-rotated";
    mocks.freighterAddress = ROTATED_ADDRESS;

    render(<WalletSessionAlert />);

    expect(screen.getByRole("alert").textContent).toContain("Switch to new wallet");
    expect(screen.getByRole("button", { name: /switch to new wallet/i })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /keep old session/i }));
    expect(mocks.keepOldSession).toHaveBeenCalled();
  });

  it("stacks the recovery banner responsively on small screens", () => {
    mocks.healthStatus = "unavailable";

    const { container } = render(<WalletSessionAlert />);

    // The banner body switches to a horizontal layout at the `sm` breakpoint.
    expect(container.querySelector(".sm\\:flex-row")).not.toBeNull();
  });
});
