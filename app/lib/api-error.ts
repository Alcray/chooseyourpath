export class GoogleApiError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status = 500, retryable = false) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
    this.retryable = retryable;
  }
}
