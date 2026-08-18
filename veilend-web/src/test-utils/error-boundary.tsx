import { Component, type ReactNode } from 'react';

interface TestBoundaryProps {
  fallback: (reset: () => void) => ReactNode;
  children: ReactNode;
}

interface TestBoundaryState {
  error: Error | null;
}

export class TestBoundary extends Component<TestBoundaryProps, TestBoundaryState> {
  state: TestBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): TestBoundaryState {
    return { error };
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.reset);
    }
    return this.props.children;
  }
}

export interface ReloadableChild {
  Child: () => ReactNode;
  marker: string;
  clear: () => void;
}

/**
 * Creates a child that throws on every render until `clear()` is called.
 * Mirrors a server component that keeps failing until `reset()` triggers a
 * fresh request, which is what Next.js `reset()` semantics expect.
 */
export function createReloadableChild(initialShouldThrow = true): ReloadableChild {
  let shouldThrow = initialShouldThrow;
  const marker = 'reloadable-child-ok';
  const clear = (): void => {
    shouldThrow = false;
  };
  const Child = () => {
    if (shouldThrow) {
      throw new Error('nested RSC crash');
    }
    return <div data-testid={marker}>recovered</div>;
  };
  return { Child, marker, clear };
}
