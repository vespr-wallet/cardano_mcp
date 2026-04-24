/**
 * Error thrown when a VESPR API request fails.
 * Contains user-friendly messages for common error scenarios.
 */
export class VesprApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalError?: Error,
    public devMessage?: string,
  ) {
    super(message);
    this.name = "VesprApiError";
  }
}

/**
 * API error response format from the backend
 */
export interface ApiErrorResponse {
  errorMessage?: string;
  devErrorMessage?: string;
}

/**
 * Get fallback error message based on HTTP status code.
 * Used when the API doesn't provide a specific error message.
 */
export function getFallbackErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return "Invalid request parameters.";
    case 401:
      return "Authentication failed. Check API credentials.";
    case 403:
      return "Access denied.";
    case 404:
      return "The requested resource was not found.";
    case 429:
      return "Rate limited. Please wait before retrying.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "Service temporarily unavailable. Try again later.";
    default:
      return `Request failed (status ${statusCode}).`;
  }
}
