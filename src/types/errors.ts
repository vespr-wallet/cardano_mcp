/**
 * Error thrown when a VESPR API request fails.
 * Contains user-friendly messages for common error scenarios.
 */
export class VesprApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: Error,
  ) {
    super(message);
    this.name = "VesprApiError";
  }
}

/**
 * Get user-friendly error message based on HTTP status code
 */
export function getErrorMessageForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "Invalid wallet address format.";
    case 404:
      return "Wallet not found. Verify the address is correct.";
    case 429:
      return "Rate limited by VESPR API. Please wait before retrying.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "VESPR API is temporarily unavailable. Try again later.";
    default:
      return `VESPR API returned an error (status ${statusCode}).`;
  }
}
