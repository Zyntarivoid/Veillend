import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_STORAGE_KEY,
  WALLET_ADDRESS_KEY,
  challengeWalletAuth,
  validateStoredSession,
  createAuthSession,
  requestAuthNonce,
} from "./auth";
import { ValidationError } from "@/lib/api/errors";

const TEST_ADDRESS = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";
const TEST_TOKEN = "mock-access-token";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("challenge-response wallet handshake", () => {
  let storage: MemoryStorage;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("challenge flow", () => {
    it("rejects the flow when a signature is not submitted and never authenticates", async () => {
      fetchMock.mockImplementation(async (url: string | URL) => {
        if (String(url).endsWith("/auth/nonce")) {
          return jsonResponse({ nonce: "nonce-123" });
        }
        throw new Error(`verify must not be reached (got ${String(url)})`);
      });

      const session = await challengeWalletAuth(TEST_ADDRESS, async () => null);

      expect(session).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(WALLET_ADDRESS_KEY)).toBeNull();
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/auth/verify"))).toBe(false);
    });

    it("does not persist a session when the backend rejects the signature", async () => {
      fetchMock.mockImplementation(async (url: string | URL) => {
        if (String(url).endsWith("/auth/nonce")) {
          return jsonResponse({ nonce: "nonce-123" });
        }
        if (String(url).endsWith("/auth/verify")) {
          return jsonResponse({ error: "invalid signature" }, 401);
        }
        throw new Error(`unexpected url ${String(url)}`);
      });

      await expect(
        challengeWalletAuth(TEST_ADDRESS, async () => "c2lnbmF0dXJl")
      ).rejects.toThrow();

      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(WALLET_ADDRESS_KEY)).toBeNull();
    });

    it("persists the session only after the backend verifies the signed nonce", async () => {
      fetchMock.mockImplementation(async (url: string | URL) => {
        if (String(url).endsWith("/auth/nonce")) {
          return jsonResponse({ nonce: "nonce-123" });
        }
        if (String(url).endsWith("/auth/verify")) {
          return jsonResponse({
            accessToken: TEST_TOKEN,
            sessionId: "session-1",
            expiresAt: "2027-01-01T00:00:00.000Z",
          });
        }
        throw new Error(`unexpected url ${String(url)}`);
      });

      const session = await challengeWalletAuth(
        TEST_ADDRESS,
        async () => "c2lnbmF0dXJl"
      );

      expect(session).not.toBeNull();
      expect(session?.authenticated).toBe(true);
      expect(session?.accessToken).toBe(TEST_TOKEN);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toContain(TEST_TOKEN);
      expect(localStorage.getItem(WALLET_ADDRESS_KEY)).toBe(TEST_ADDRESS);

      const verifyCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/auth/verify")
      );
      expect(verifyCall).toBeDefined();
      const init = verifyCall?.[1] as RequestInit | undefined;
      expect(JSON.parse(String(init?.body))).toEqual({
        walletAddress: TEST_ADDRESS,
        nonce: "nonce-123",
        signature: "c2lnbmF0dXJl",
      });
    });
  });

  describe("startup integrity check", () => {
    it("clears a forged wallet address when no verified session exists", async () => {
      localStorage.setItem(WALLET_ADDRESS_KEY, TEST_ADDRESS);

      const session = await validateStoredSession();

      expect(session).toBeNull();
      expect(localStorage.getItem(WALLET_ADDRESS_KEY)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("clears a forged auth record that carries no access token", async () => {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          address: TEST_ADDRESS,
          publicKey: TEST_ADDRESS,
          authenticated: true,
        })
      );
      localStorage.setItem(WALLET_ADDRESS_KEY, TEST_ADDRESS);

      const session = await validateStoredSession();

      expect(session).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(WALLET_ADDRESS_KEY)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("auto-logs-out a session the backend no longer recognises", async () => {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          address: TEST_ADDRESS,
          publicKey: TEST_ADDRESS,
          authenticated: true,
          accessToken: "forged-token",
          expiresAt: "2027-01-01T00:00:00.000Z",
        })
      );
      localStorage.setItem(WALLET_ADDRESS_KEY, TEST_ADDRESS);
      fetchMock.mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));

      const session = await validateStoredSession();

      expect(session).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(WALLET_ADDRESS_KEY)).toBeNull();
      expect(fetchMock.mock.calls[0][0]).toContain("/auth/session");
    });

    it("auto-logs-out when the stored address disagrees with the backend session", async () => {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          address: TEST_ADDRESS,
          publicKey: TEST_ADDRESS,
          authenticated: true,
          accessToken: TEST_TOKEN,
          expiresAt: "2027-01-01T00:00:00.000Z",
        })
      );
      localStorage.setItem(WALLET_ADDRESS_KEY, TEST_ADDRESS);
      fetchMock.mockResolvedValue(
        jsonResponse({
          walletAddress: "GDJ7OQZZ7I6YFNO3GVWJQN6FXTWY3QJ6VYGDFTX5Y6M6V7GKP7CJGHVJ",
        })
      );

      const session = await validateStoredSession();

      expect(session).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(WALLET_ADDRESS_KEY)).toBeNull();
    });

    it("clears an expired local session", async () => {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          address: TEST_ADDRESS,
          publicKey: TEST_ADDRESS,
          authenticated: true,
          accessToken: TEST_TOKEN,
          expiresAt: "2020-01-01T00:00:00.000Z",
        })
      );

      const session = await validateStoredSession();

      expect(session).toBeNull();
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(WALLET_ADDRESS_KEY)).toBeNull();
    });

    it("keeps a valid session when the backend confirms it", async () => {
      createAuthSession(TEST_ADDRESS, {
        accessToken: TEST_TOKEN,
        sessionId: "session-1",
        expiresAt: "2027-01-01T00:00:00.000Z",
      });
      fetchMock.mockResolvedValue(
        jsonResponse({ walletAddress: TEST_ADDRESS })
      );

      const session = await validateStoredSession();

      expect(session).not.toBeNull();
      expect(session?.address).toBe(TEST_ADDRESS);
      expect(localStorage.getItem(AUTH_STORAGE_KEY)).toContain(TEST_TOKEN);
    });

    it("rejects a nonce payload that fails schema validation without retrying", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ nonce: 123 }));

      await expect(requestAuthNonce(TEST_ADDRESS)).rejects.toBeInstanceOf(ValidationError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
