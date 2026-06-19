export class ApiResponseDto<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  readonly meta?: unknown;

  constructor(partial: Partial<ApiResponseDto<T>>) {
    Object.assign(this, partial);
  }

  static success<T>(data: T, meta?: unknown): ApiResponseDto<T> {
    return new ApiResponseDto<T>({
      success: true,
      data,
      meta,
    });
  }

  static fail(
    code: string,
    message: string,
    details?: unknown,
  ): ApiResponseDto<unknown> {
    return new ApiResponseDto<unknown>({
      success: false,
      error: {
        code,
        message,
        details,
      },
    });
  }
}
