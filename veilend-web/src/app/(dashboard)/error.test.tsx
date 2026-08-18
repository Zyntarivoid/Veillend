// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import DashboardGroupError from './error';
import { createReloadableChild, TestBoundary } from '@/test-utils/error-boundary';

describe('Dashboard route group error boundary (/app/(dashboard)/error.tsx)', () => {
  let container: HTMLDivElement;
  let root: Root;

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
    vi.restoreAllMocks();
  });

  it('renders the dashboard error fallback when a nested component throws', async () => {
    const { Child } = createReloadableChild();
    await act(async () => {
      root.render(
        <TestBoundary
          fallback={(reset) => <DashboardGroupError error={new Error('boom')} reset={reset} />}
        >
          <Child />
        </TestBoundary>,
      );
    });

    expect(container.querySelector('main')).not.toBeNull();
    expect(container.querySelector('h1')?.textContent).toContain('Dashboard Error');
    expect(
      Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.includes('Try Again')),
    ).toBe(true);
  });

  it('reloads the subtree when Try Again calls reset()', async () => {
    const { Child, marker, clear } = createReloadableChild();
    await act(async () => {
      root.render(
        <TestBoundary
          fallback={(reset) => (
            <DashboardGroupError
              error={new Error('boom')}
              reset={() => {
                clear();
                reset();
              }}
            />
          )}
        >
          <Child />
        </TestBoundary>,
      );
    });

    expect(container.querySelector(`[data-testid="${marker}"]`)).toBeNull();

    const tryAgain = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try Again'),
    ) as HTMLButtonElement;
    await act(async () => {
      tryAgain.click();
    });

    expect(container.querySelector(`[data-testid="${marker}"]`)).not.toBeNull();
  });
});
