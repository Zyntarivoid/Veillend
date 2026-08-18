// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import NotFound from './not-found';

describe('Not found page (/app/not-found.tsx)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders a branded 404 with a back-to-home link', async () => {
    await act(async () => {
      root.render(<NotFound />);
    });

    expect(container.querySelector('main')).not.toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('Page Not Found');

    const homeLink = container.querySelector('a[href="/"]');
    expect(homeLink).not.toBeNull();
    expect(homeLink?.textContent).toContain('Back to Home');
  });
});
