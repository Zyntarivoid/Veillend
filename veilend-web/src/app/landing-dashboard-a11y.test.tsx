// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import VeilLendLandingPage from "@/components/VeilLendLandingPage";

const dashboardMocks = vi.hoisted(() => ({
  walletState: {
    isConnected: false,
    isAuthenticated: false,
    address: null as string | null,
    isLoading: false,
    error: null as string | null,
  },
}));

vi.mock("@/context/WalletContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/context/WalletContext")>();
  return {
    ...actual,
    useWallet: () => dashboardMocks.walletState,
  };
});

vi.mock("@/components/WalletConnect", () => ({
  WalletConnect: () => <div>wallet-connect-stub</div>,
}));
vi.mock("@/components/WalletStatus", () => ({
  WalletStatus: () => <div>wallet-status-stub</div>,
}));
vi.mock("@/components/ActionTray", () => ({
  ActionTray: () => <div>action-tray-stub</div>,
}));

import VeilLendDashboard from "@/app/(dashboard)/page";

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

describe("page landmarks and keyboard access", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("landing page", () => {
    beforeEach(() => {
      dashboardMocks.walletState.isConnected = false;
      dashboardMocks.walletState.isAuthenticated = false;
      dashboardMocks.walletState.address = null;
    });

    it("has exactly one main landmark and one visible h1", () => {
      render(<VeilLendLandingPage />);

      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("keeps every interactive control keyboard focusable", () => {
      render(<VeilLendLandingPage />);

      const focusables = getFocusableElements(document.body);
      expect(focusables.length).toBeGreaterThan(0);

      for (const el of focusables) {
        el.focus();
        expect(document.activeElement).toBe(el);
      }
    });

    it("moves focus with Tab and exposes a visible focus indicator", async () => {
      const user = userEvent.setup();
      render(<VeilLendLandingPage />);

      const focusables = getFocusableElements(document.body);
      expect(focusables.length).toBeGreaterThan(0);

      await user.tab();
      expect(focusables).toContain(document.activeElement as HTMLElement);
    });
  });

  describe("dashboard page", () => {
    it("has exactly one main landmark and one visible h1 when connected", () => {
      dashboardMocks.walletState.isConnected = true;
      dashboardMocks.walletState.isAuthenticated = true;
      dashboardMocks.walletState.address = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";

      render(<VeilLendDashboard />);

      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });

    it("has exactly one main landmark and one visible h1 when disconnected", () => {
      dashboardMocks.walletState.isConnected = false;
      dashboardMocks.walletState.isAuthenticated = false;
      dashboardMocks.walletState.address = null;

      render(<VeilLendDashboard />);

      expect(screen.getAllByRole("main")).toHaveLength(1);
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Connect Wallet");
    });

    it("activates buttons with Enter and Space", async () => {
      const user = userEvent.setup();
      dashboardMocks.walletState.isConnected = true;
      dashboardMocks.walletState.isAuthenticated = true;
      dashboardMocks.walletState.address = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";

      render(<VeilLendDashboard />);

      const toggle = screen.getByRole("button", { name: /toggle empty state/i });
      expect(toggle.className).toContain("focus-visible");

      toggle.focus();
      await user.keyboard("{Enter}");
      expect(screen.getByText(/No shielded assets detected/i)).toBeTruthy();

      toggle.focus();
      await user.keyboard(" ");
      expect(screen.queryByText(/No shielded assets detected/i)).toBeNull();
    });
  });
});
