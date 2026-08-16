import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AmountDisplay, UNAVAILABLE_AMOUNT_PLACEHOLDER } from './AmountDisplay';
import { DashboardPortfolioCards } from './DashboardPortfolioCards';

describe('AmountDisplay', () => {
  it('renders a formatted USD amount for finite values', () => {
    const html = renderToStaticMarkup(<AmountDisplay value={1} />);
    expect(html).toContain('$1.00');
    expect(html).not.toContain(UNAVAILABLE_AMOUNT_PLACEHOLDER);
  });

  it('renders an em dash placeholder for NaN and null', () => {
    expect(renderToStaticMarkup(<AmountDisplay value={null} />)).toContain(
      UNAVAILABLE_AMOUNT_PLACEHOLDER,
    );
    expect(renderToStaticMarkup(<AmountDisplay value={Number.NaN} />)).toContain(
      UNAVAILABLE_AMOUNT_PLACEHOLDER,
    );
    expect(renderToStaticMarkup(<AmountDisplay value={Number.POSITIVE_INFINITY} />)).toContain(
      UNAVAILABLE_AMOUNT_PLACEHOLDER,
    );
  });
});

describe('DashboardPortfolioCards', () => {
  it('shows em dashes in numeric slots when portfolio data is unavailable', () => {
    const html = renderToStaticMarkup(<DashboardPortfolioCards portfolio={null} />);
    const slots = html.match(/data-testid="amount-slot"/g) ?? [];
    expect(slots).toHaveLength(3);
    expect(html).toContain(UNAVAILABLE_AMOUNT_PLACEHOLDER);
    expect(html).not.toContain('NaN');
  });
});
