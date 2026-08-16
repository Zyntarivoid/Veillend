// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AmountInput } from "./AmountInput";
import type { ValidationContext } from "@/lib/validation/amount";

const context: ValidationContext = {
  availableBalance: 100,
  priceUsd: 1,
  decimals: 7,
  borrowLimitUsd: 0,
  outstandingDebt: 0,
};

describe("AmountInput Max button", () => {
  afterEach(() => {
    cleanup();
  });

  const renderComponent = (onChange: (value: string) => void = vi.fn()) =>
    render(
      <AmountInput
        action="DEPOSIT"
        context={context}
        assetSymbol="USDC"
        value=""
        onChange={onChange}
      />
    );

  it("renders the Max button with the exact accessible label", () => {
    renderComponent();

    const max = screen.getByRole("button", { name: "Use maximum available amount" });
    expect(max).toBeTruthy();
    expect(max.tagName).toBe("BUTTON");
  });

  it("fills the maximum amount on keyboard-focusable activation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderComponent(onChange);

    const max = screen.getByRole("button", { name: "Use maximum available amount" });
    max.focus();
    expect(document.activeElement).toBe(max);

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("100");
  });
});
