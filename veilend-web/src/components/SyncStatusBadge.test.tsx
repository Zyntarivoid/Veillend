// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SyncStatusBadge } from "./SyncStatusBadge";

describe("SyncStatusBadge", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  const render = async (props: React.ComponentProps<typeof SyncStatusBadge>) => {
    await act(async () => {
      root.render(<SyncStatusBadge {...props} />);
    });
  };

  it("exposes role=status and aria-live=polite", async () => {
    await render({ status: "live", lastSyncedAt: null });

    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toContain("Live");
  });

  it("announces syncing and synced states", async () => {
    await render({ status: "loading", lastSyncedAt: null });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Syncing");

    await render({ status: "live", lastSyncedAt: null });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Live");
  });

  it("renders a labelled refresh button when onRefresh is provided", async () => {
    const onRefresh = vi.fn();
    await render({ status: "stale", lastSyncedAt: null, onRefresh });

    const refresh = container.querySelector('button[aria-label="Refresh positions"]');
    expect(refresh).not.toBeNull();
    expect(refresh?.tagName).toBe("BUTTON");

    await act(async () => {
      (refresh as HTMLButtonElement).click();
    });
    expect(onRefresh).toHaveBeenCalled();
  });
});
