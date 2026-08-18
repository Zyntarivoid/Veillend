// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TrackedLink } from "./TrackedLink";

describe("TrackedLink", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const render = async (props: React.ComponentProps<typeof TrackedLink>) => {
    await act(async () => {
      root.render(<TrackedLink {...props} />);
    });
  };

  it("renders a semantic anchor for navigation", async () => {
    await render({
      ctaId: "dashboard-cta",
      ctaLabel: "Open Dashboard",
      href: "/dashboard",
      children: "Open Dashboard",
    });

    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("href")).toBe("/dashboard");
    expect(link?.textContent).toContain("Open Dashboard");
  });

  it("is keyboard focusable and fires the click handler on activation", async () => {
    const onClick = vi.fn();
    await render({
      ctaId: "docs-cta",
      ctaLabel: "Read Docs",
      href: "#docs",
      onClick,
      children: "Read Docs",
    });

    const link = container.querySelector("a") as HTMLAnchorElement;
    link.focus();
    expect(document.activeElement).toBe(link);

    await act(async () => {
      link.click();
    });
    expect(onClick).toHaveBeenCalled();
  });
});
