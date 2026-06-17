export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    rawError?: unknown;
  };
}
