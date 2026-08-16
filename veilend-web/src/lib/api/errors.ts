export class AppError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'AppError';
    this.retryable = retryable;
  }
}

export class ValidationError extends AppError {
  readonly path: string;
  readonly issues: unknown;

  constructor(message: string, path: string, issues?: unknown) {
    super(message, false);
    this.name = 'ValidationError';
    this.path = path;
    this.issues = issues ?? null;
  }
}

export class NetworkError extends AppError {
  constructor(message: string) {
    super(message, true);
    this.name = 'NetworkError';
  }
}

export class HttpError extends AppError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message, status >= 500);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.retryable;
  }
  return false;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
