// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContributorInterest } from "./ContributorInterest";

describe("ContributorInterest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders toggle chips as native buttons with aria-pressed", () => {
    render(<ContributorInterest />);

    const chips = screen.getAllByRole("button");
    expect(chips).toHaveLength(5);
    expect(chips.every((c) => c.tagName === "BUTTON")).toBe(true);
    expect(chips.every((c) => c.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("exposes the selected state via aria-pressed on activation", async () => {
    const user = userEvent.setup();
    render(<ContributorInterest />);

    const first = screen.getAllByRole("button")[0];
    await user.click(first);

    expect(first.getAttribute("aria-pressed")).toBe("true");
    const others = screen.getAllByRole("button").slice(1);
    expect(others.every((c) => c.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("activates chips via Enter and Space", async () => {
    const user = userEvent.setup();
    render(<ContributorInterest />);

    const chips = screen.getAllByRole("button");

    chips[0].focus();
    await user.keyboard("{Enter}");
    expect(chips[0].getAttribute("aria-pressed")).toBe("true");

    chips[1].focus();
    await user.keyboard(" ");
    expect(chips[1].getAttribute("aria-pressed")).toBe("true");
    expect(chips[0].getAttribute("aria-pressed")).toBe("false");
  });
});
