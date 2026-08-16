type SentryLike = {
  captureException?: (error: unknown) => void;
};

function isSentryLike(value: unknown): value is SentryLike {
  return typeof value === 'object' && value !== null;
}

function getSentry(): SentryLike | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const candidate = Reflect.get(window, 'Sentry');
  return isSentryLike(candidate) ? candidate : undefined;
}

export function reportError(error: unknown, context = 'API error'): void {
  console.error(context, error);
  getSentry()?.captureException?.(error);
}
