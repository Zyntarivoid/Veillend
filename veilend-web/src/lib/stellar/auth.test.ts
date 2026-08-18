// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  challengeWalletAuth,
  requestAuthNonce,
  validateStoredSession,
} from "./auth";
import { ValidationError } from "../validation/api-schemas";

const TEST_ADDRESS = "GBXFXNDLV4LSWA4VB7YIL5GBD7BVNR22SGBTDKMO2SBZZHDXSKZYCP7L";
const TEST_TOKEN = "mock-access-token";

const SESSION_MARKER = "veillend_has_session=true";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("challenge-response wallet handshake", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("challenge flow", () => {
    it("rejects an invalid nonce response without retrying", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ nonce: 123 }));

      await expect(requestAuthNonce(TEST_ADDRESS)).rejects.toBeInstanceOf(ValidationError);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("rejects the flow when a signature is not submitted and never authenticates", async () => {
      fetchMock.mockImplementation(async (url: string | URL) => {
        if (String(url).endsWith("/auth/nonce")) {
          return jsonResponse({ nonce: "nonce-123" });
        }
        throw new Error(`verify must not be reached (got ${String(url)})`);
      });

      const session = await challengeWalletAuth(TEST_ADDRESS, async () => null);

      expect(session).toBeNull();
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
      expect(session?.address).toBe(TEST_ADDRESS);
      expect(session?.accessToken).toBe(TEST_TOKEN);

      const verifyCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes("/auth/verify")
      );
      expect(verifyCall).toBeDefined();
      const init = verifyCall?.[1] as RequestInit | undefined;
      expect(JSON.parse(String(init?.body))).toEqual({
        walletAddress: TEST_ADDRESS,
        signature: "c2lnbmF0dXJl",
      });
    });
  });

  describe("startup integrity check", () => {
    const setMarkerCookie = () => {
      document.cookie = `${SESSION_MARKER}; path=/`;
    };
    const clearMarkerCookie = () => {
      document.cookie = "veillend_has_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    };

    afterEach(() => {
      clearMarkerCookie();
    });

    it("returns null when no session marker cookie is present", async () => {
      const session = await validateStoredSession();

      expect(session).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("auto-logs-out a session the backend no longer recognises", async () => {
      setMarkerCookie();
      fetchMock.mockImplementation(async (url: string | URL) => {
        if (String(url).endsWith("/auth/session")) {
          return jsonResponse({ error: "unauthorized" }, 401);
        }
        if (String(url).endsWith("/auth/logout")) {
          return jsonResponse({ success: true });
        }
        throw new Error(`unexpected url ${String(url)}`);
      });

      const session = await validateStoredSession();

      expect(session).toBeNull();
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/auth/session"))).toBe(true);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/auth/logout"))).toBe(true);
    });

    it("auto-logs-out when the backend returns no wallet address", async () => {
      setMarkerCookie();
      fetchMock.mockImplementation(async (url: string | URL) => {
        if (String(url).endsWith("/auth/session")) {
          return jsonResponse({});
        }
        if (String(url).endsWith("/auth/logout")) {
          return jsonResponse({ success: true });
        }
        throw new Error(`unexpected url ${String(url)}`);
      });

      const session = await validateStoredSession();

      expect(session).toBeNull();
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/auth/logout"))).toBe(true);
    });

    it("keeps a valid session when the backend confirms it", async () => {
      setMarkerCookie();
      fetchMock.mockResolvedValue(jsonResponse({ walletAddress: TEST_ADDRESS }));

      const session = await validateStoredSession();

      expect(session).not.toBeNull();
      expect(session?.address).toBe(TEST_ADDRESS);
      expect(session?.authenticated).toBe(true);
    });
  });
});
