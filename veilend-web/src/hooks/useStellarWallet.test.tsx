// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WalletProvider, useWallet } from "@/context/WalletContext";
import type { WalletContextType } from "@/context/WalletContext";
import { WalletSessionAlert } from "@/components/WalletSessionAlert";

const TEST_ADDRESS = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";
const ROTATED_ADDRESS = "GDJ7OQZZ7I6YFNO3GVWJQN6FXTWY3QJ6VYGDFTX5Y6M6V7GKP7CJGHVJ";

const mocks = vi.hoisted(() => ({
  connectFreighter: vi.fn(),
  signMessage: vi.fn(),
  disconnectWallet: vi.fn(),
  getFreighterHealth: vi.fn(),
}));

vi.mock("@/lib/stellar/wallet", () => ({
  isFreighterInstalled: () => true,
  connectFreighter: mocks.connectFreighter,
  signMessage: mocks.signMessage,
  disconnectWallet: mocks.disconnectWallet,
  getFreighterHealth: mocks.getFreighterHealth,
}));

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const healthyHealth = () => ({ available: true, address: TEST_ADDRESS });
const unavailableHealth = () => ({ available: false, address: null });

function Harness({ onUpdate }: { onUpdate: (state: WalletContextType) => void }) {
  const wallet = useWallet();

  useEffect(() => {
    onUpdate(wallet);
  });

  return (
    <div>
      <button data-testid="connect" onClick={() => void wallet.connect()}>
        Connect
      </button>
      <button data-testid="reconnect" onClick={() => void wallet.reconnect()}>
        Reconnect
      </button>
      <button data-testid="switch" onClick={() => void wallet.switchToNewWallet()}>
        Switch
      </button>
      <button data-testid="keep" onClick={wallet.keepOldSession}>
        Keep
      </button>
      <span data-testid="authed">{String(wallet.isAuthenticated)}</span>
      <span data-testid="connected">{String(wallet.isConnected)}</span>
      <span data-testid="health">{wallet.healthStatus}</span>
      <span data-testid="address">{wallet.address ?? ""}</span>
      <WalletSessionAlert />
    </div>
  );
}

describe("useStellarWallet / WalletProvider challenge-response flow", () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    document.cookie = "veillend_has_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";

    mocks.connectFreighter.mockResolvedValue({
      address: TEST_ADDRESS,
      publicKey: TEST_ADDRESS,
    });
    mocks.signMessage.mockResolvedValue("c2lnbmF0dXJl");
    mocks.disconnectWallet.mockResolvedValue(undefined);
    mocks.getFreighterHealth.mockResolvedValue(healthyHealth());

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const renderProvider = async (updates: WalletContextType[]) => {
    await act(async () => {
      root.render(
        <WalletProvider>
          <Harness onUpdate={(state) => updates.push(state)} />
        </WalletProvider>
      );
    });
  };

  const clickTestId = async (id: string) => {
    const button = container.querySelector<HTMLButtonElement>(`[data-testid=${id}]`);
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
  };

  const triggerHeartbeat = async () => {
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
  };

  const mockAuthEndpoints = (sessionWalletAddress: string | null = TEST_ADDRESS) => {
    fetchMock.mockImplementation(async (url: string | URL) => {
      const target = String(url);
      if (target.endsWith("/auth/nonce")) {
        return jsonResponse({ nonce: "nonce-123" });
      }
      if (target.endsWith("/auth/verify")) {
        return jsonResponse({
          accessToken: "access-token-1",
          sessionId: "session-1",
          expiresAt: "2027-01-01T00:00:00.000Z",
        });
      }
      if (target.endsWith("/auth/session")) {
        return sessionWalletAddress
          ? jsonResponse({ walletAddress: sessionWalletAddress })
          : jsonResponse({ error: "unauthorized" }, 401);
      }
      if (target.endsWith("/auth/logout")) {
        return jsonResponse({ success: true });
      }
      throw new Error(`unexpected url ${target}`);
    });
  };

  it("becomes authenticated only after backend verification", async () => {
    mockAuthEndpoints();

    const updates: WalletContextType[] = [];
    await renderProvider(updates);

    expect(updates.at(-1)?.isAuthenticated).toBe(false);

    await clickTestId("connect");

    expect(updates.at(-1)?.isAuthenticated).toBe(true);
    expect(updates.at(-1)?.address).toBe(TEST_ADDRESS);
    expect(updates.at(-1)?.healthStatus).toBe("healthy");
  });

  it("stays disconnected when the wallet does not submit a signature", async () => {
    mocks.signMessage.mockResolvedValue(null);
    fetchMock.mockImplementation(async (url: string | URL) => {
      if (String(url).endsWith("/auth/nonce")) {
        return jsonResponse({ nonce: "nonce-123" });
      }
      throw new Error(`verify must not be reached (got ${String(url)})`);
    });

    const updates: WalletContextType[] = [];
    await renderProvider(updates);
    await clickTestId("connect");

    expect(updates.at(-1)?.isAuthenticated).toBe(false);
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/auth/verify"))
    ).toBe(false);
  });

  it("restores a valid cookie session confirmed by the backend on page load", async () => {
    document.cookie = "veillend_has_session=true; path=/";
    mockAuthEndpoints();

    const updates: WalletContextType[] = [];
    await renderProvider(updates);

    expect(updates.at(-1)?.isAuthenticated).toBe(true);
    expect(updates.at(-1)?.address).toBe(TEST_ADDRESS);
  });

  it("auto-logs-out a session the backend rejects on page load", async () => {
    document.cookie = "veillend_has_session=true; path=/";
    mockAuthEndpoints(null);

    const updates: WalletContextType[] = [];
    await renderProvider(updates);

    expect(updates.at(-1)?.isAuthenticated).toBe(false);
    expect(updates.at(-1)?.address).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/auth/logout"))).toBe(true);
  });

  describe("wallet health heartbeat", () => {
    const renderConnected = async () => {
      document.cookie = "veillend_has_session=true; path=/";
      mockAuthEndpoints(TEST_ADDRESS);
      const updates: WalletContextType[] = [];
      await renderProvider(updates);
      expect(updates.at(-1)?.isConnected).toBe(true);
      return updates;
    };

    it("keeps a healthy wallet session connected", async () => {
      mocks.getFreighterHealth.mockResolvedValue(healthyHealth());
      const updates = await renderConnected();

      await triggerHeartbeat();

      expect(updates.at(-1)?.healthStatus).toBe("healthy");
      expect(updates.at(-1)?.isConnected).toBe(true);
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it("warns when the wallet becomes unavailable and offers reconnect", async () => {
      mocks.getFreighterHealth.mockResolvedValue(unavailableHealth());
      const updates = await renderConnected();

      await triggerHeartbeat();

      expect(updates.at(-1)?.healthStatus).toBe("unavailable");
      expect(container.textContent).toContain(
        "Wallet unavailable — please unlock Freighter and reconnect"
      );
      expect(container.querySelector('[data-testid="reconnect"]')).not.toBeNull();
    });

    it("warns the same way when the wallet exposes no address", async () => {
      mocks.getFreighterHealth.mockResolvedValue({ available: true, address: null });
      const updates = await renderConnected();

      await triggerHeartbeat();

      expect(updates.at(-1)?.healthStatus).toBe("unavailable");
      expect(container.textContent).toContain(
        "Wallet unavailable — please unlock Freighter and reconnect"
      );
    });

    it("clears local state and shows the expiry toast when the session expires", async () => {
      mocks.getFreighterHealth.mockResolvedValue(healthyHealth());
      const updates = await renderConnected();

      // Backend now reports the session is gone.
      mockAuthEndpoints(null);
      await triggerHeartbeat();

      expect(updates.at(-1)?.healthStatus).toBe("session-expired");
      expect(updates.at(-1)?.isConnected).toBe(false);
      expect(updates.at(-1)?.isAuthenticated).toBe(false);
      expect(updates.at(-1)?.address).toBeNull();
      expect(container.textContent).toContain("Session expired. Please reconnect.");
      expect(container.querySelector('[data-testid="reconnect"]')).not.toBeNull();
    });

    it("detects wallet address rotation without silently substituting it", async () => {
      mocks.getFreighterHealth.mockResolvedValue({
        available: true,
        address: ROTATED_ADDRESS,
      });
      const updates = await renderConnected();

      await triggerHeartbeat();

      expect(updates.at(-1)?.healthStatus).toBe("address-rotated");
      expect(updates.at(-1)?.freighterAddress).toBe(ROTATED_ADDRESS);
      // The authenticated wallet must NOT change on its own.
      expect(updates.at(-1)?.address).toBe(TEST_ADDRESS);
      expect(container.textContent).toContain("Switch to new wallet");
      expect(container.textContent).toContain("Keep old session");
    });

    it("keeps the old session when the user chooses keep", async () => {
      mocks.getFreighterHealth.mockResolvedValue({
        available: true,
        address: ROTATED_ADDRESS,
      });
      const updates = await renderConnected();
      await triggerHeartbeat();
      expect(updates.at(-1)?.healthStatus).toBe("address-rotated");

      await clickTestId("keep");

      expect(updates.at(-1)?.healthStatus).toBe("healthy");
      expect(updates.at(-1)?.freighterAddress).toBeNull();
      expect(updates.at(-1)?.address).toBe(TEST_ADDRESS);

      // The same wallet should not re-trigger the warning.
      await triggerHeartbeat();
      expect(updates.at(-1)?.healthStatus).toBe("healthy");
    });

    it("switches to the new wallet via a fresh challenge-response", async () => {
      mocks.getFreighterHealth.mockResolvedValue({
        available: true,
        address: ROTATED_ADDRESS,
      });
      mocks.connectFreighter.mockResolvedValue({
        address: ROTATED_ADDRESS,
        publicKey: ROTATED_ADDRESS,
      });
      const updates = await renderConnected();
      await triggerHeartbeat();
      expect(updates.at(-1)?.healthStatus).toBe("address-rotated");

      await clickTestId("switch");

      expect(updates.at(-1)?.healthStatus).toBe("healthy");
      expect(updates.at(-1)?.isConnected).toBe(true);
      expect(updates.at(-1)?.address).toBe(ROTATED_ADDRESS);
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it("recovers cleanly on a successful reconnect", async () => {
      mocks.getFreighterHealth.mockResolvedValue(unavailableHealth());
      const updates = await renderConnected();
      await triggerHeartbeat();
      expect(updates.at(-1)?.healthStatus).toBe("unavailable");

      // Wallet is unlocked again and the challenge-response succeeds.
      mocks.getFreighterHealth.mockResolvedValue(healthyHealth());
      await clickTestId("reconnect");

      expect(updates.at(-1)?.healthStatus).toBe("healthy");
      expect(updates.at(-1)?.isConnected).toBe(true);
      expect(updates.at(-1)?.address).toBe(TEST_ADDRESS);
      expect(container.querySelector('[role="alert"]')).toBeNull();
    });

    it("surfaces a safe error and no stale connected state on failed reconnect", async () => {
      mocks.getFreighterHealth.mockResolvedValue(unavailableHealth());
      const updates = await renderConnected();
      await triggerHeartbeat();
      expect(updates.at(-1)?.healthStatus).toBe("unavailable");

      mocks.connectFreighter.mockRejectedValue(new Error("Freighter is not connected. Please unlock your wallet."));
      await clickTestId("reconnect");

      expect(updates.at(-1)?.isConnected).toBe(false);
      expect(updates.at(-1)?.error).toBe("Freighter is not connected. Please unlock your wallet.");
    });

    it("runs a single heartbeat interval and cleans it up on unmount", async () => {
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

      const updates: WalletContextType[] = [];
      await renderProvider(updates);

      const heartbeatCalls = setIntervalSpy.mock.calls.filter(
        ([, ms]) => ms === 30_000
      );
      expect(heartbeatCalls).toHaveLength(1);

      const intervalId = setIntervalSpy.mock.results[0]?.value as
        | ReturnType<typeof setInterval>
        | undefined;

      await act(async () => {
        root.unmount();
      });

      if (intervalId !== undefined) {
        expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
      }
    });
  });
});
