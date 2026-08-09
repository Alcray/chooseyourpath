export class GoogleApiError extends Error {
  status: number;
  retryable: boolean;
  code?: string;

  constructor(message: string, status = 500, retryable = false, code?: string) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.retryable = retryable;
    this.code = code;
  }
}
