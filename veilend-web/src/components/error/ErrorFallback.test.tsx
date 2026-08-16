// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ErrorFallback from "./ErrorFallback";

describe("ErrorFallback retry button", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  const render = async (reset: () => void | Promise<void>) => {
    await act(async () => {
      root.render(<ErrorFallback error={new Error("boom")} reset={reset} showReport={false} />);
    });
  };

  const retryButton = (): HTMLButtonElement =>
    Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Try Again")
    ) as HTMLButtonElement;

  it("has an explicit accessible label and aria-busy=false initially", async () => {
    await render(vi.fn());

    const btn = retryButton();
    expect(btn).toBeDefined();
    expect(btn.getAttribute("aria-label")).toBe("Retry loading");
    expect(btn.getAttribute("aria-busy")).toBe("false");
  });

  it("sets aria-busy while retrying and clears it after completion", async () => {
    let resolveReset: (() => void) | undefined;
    const reset = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReset = resolve;
        })
    );
    await render(reset);

    const btn = retryButton();
    await act(async () => {
      btn.click();
    });

    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(reset).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveReset?.();
    });

    expect(btn.getAttribute("aria-busy")).toBe("false");
  });

  it("prevents duplicate retry submissions while retrying", async () => {
    let resolveReset: (() => void) | undefined;
    const reset = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReset = resolve;
        })
    );
    await render(reset);

    const btn = retryButton();
    await act(async () => {
      btn.click();
      btn.click();
    });

    expect(reset).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveReset?.();
    });
    expect(btn.getAttribute("aria-busy")).toBe("false");
  });
});
