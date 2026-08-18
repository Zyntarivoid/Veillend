// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GlobalError from './global-error';

describe('Global error boundary (/app/global-error.tsx)', () => {
  let container: HTMLDivElement;
  let root: Root;
  const initialLang = document.documentElement.getAttribute('lang');
  const initialBodyClass = document.body.className;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.documentElement.removeAttribute('lang');
    if (initialLang) document.documentElement.setAttribute('lang', initialLang);
    document.body.className = initialBodyClass;
    vi.restoreAllMocks();
  });

  it('renders a full document shell with the error fallback when a nested component throws', async () => {
    const reset = vi.fn();
    await act(async () => {
      root.render(<GlobalError error={new Error('root boom')} reset={reset} />);
    });

    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.body.classList.contains('bg-background')).toBe(true);
    expect(container.querySelector('main')).not.toBeNull();
    expect(container.querySelector('h1')?.textContent).toContain('Something went wrong');
  });

  it('calls reset() when Try Again is clicked', async () => {
    const reset = vi.fn();
    await act(async () => {
      root.render(<GlobalError error={new Error('root boom')} reset={reset} />);
    });

    const tryAgain = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try Again'),
    ) as HTMLButtonElement;
    await act(async () => {
      tryAgain.click();
    });

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
