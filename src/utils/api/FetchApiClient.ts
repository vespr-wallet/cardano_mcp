import type { z } from "zod";
import { logger } from "../logger.js";
import { VesprApiError, getErrorMessageForStatus } from "../../types/errors.js";

export interface FetchApiClientConfig {
  baseUrl: string;
  headers: Record<string, string>;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
}

interface BaseRequest<T> {
  path: string;
  schema: z.ZodType<T>;
  context: string;
}

export interface GetRequest<T> extends BaseRequest<T> {}

export interface PostRequest<T> extends BaseRequest<T> {
  body: unknown;
}

interface InternalRequest<T> extends BaseRequest<T> {
  method: "GET" | "POST";
  body?: unknown;
}

export class FetchApiClient {
  constructor(private readonly config: FetchApiClientConfig) {}

  async get<T>(request: GetRequest<T>): Promise<T> {
    return this.request({ ...request, method: "GET" });
  }

  async post<T>(request: PostRequest<T>): Promise<T> {
    return this.request({ ...request, method: "POST" });
  }

  private async request<T>(request: InternalRequest<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await this.requestOnce(request);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!this.isRetryableError(error) || attempt === this.config.maxRetries - 1) {
          throw error;
        }

        const delayMs = this.config.retryBaseDelayMs * Math.pow(2, attempt);
        logger.warn("api_retry", {
          context: request.context,
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries,
          delayMs,
          error: lastError.message,
        });

        await this.sleep(delayMs);
      }
    }

    throw lastError;
  }

  private async requestOnce<T>(request: InternalRequest<T>): Promise<T> {
    const url = `${this.config.baseUrl}${request.path}`;
    const start = Date.now();

    logger.info("api_request", { method: request.method, context: request.context, path: request.path });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    const fetchOptions: RequestInit = {
      method: request.method,
      signal: controller.signal,
      headers: this.config.headers,
      body: request.method === "POST" && request.body ? JSON.stringify(request.body) : undefined,
    };

    let response: Response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (error) {
      clearTimeout(timeoutId);
      throw this.handleFetchError(error, request.context, start);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const message = getErrorMessageForStatus(response.status);
      logger.error("api_error", {
        context: request.context,
        statusCode: response.status,
        latencyMs: Date.now() - start,
      });
      throw new VesprApiError(message, response.status);
    }

    const data = await this.parseJson(response, request.context, start);
    const result = this.validateResponse(data, request.schema, request.context, start);

    logger.info("api_success", { context: request.context, latencyMs: Date.now() - start });

    return result;
  }

  private handleFetchError(error: unknown, context: string, start: number): VesprApiError {
    if (error instanceof Error && error.name === "AbortError") {
      logger.error("api_timeout", { context, latencyMs: Date.now() - start });
      return new VesprApiError("Request timed out. Try again.", undefined, error);
    }

    logger.error("api_network_error", { context, latencyMs: Date.now() - start });
    return new VesprApiError(
      "Unable to connect to API. Check your internet connection.",
      undefined,
      error instanceof Error ? error : undefined,
    );
  }

  private async parseJson(response: Response, context: string, start: number): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      logger.error("api_parse_error", { context, latencyMs: Date.now() - start });
      throw new VesprApiError("Failed to parse API response.", undefined, error instanceof Error ? error : undefined);
    }
  }

  private validateResponse<T>(data: unknown, schema: z.ZodType<T>, context: string, start: number): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      logger.error("api_validation_error", {
        context,
        issues: result.error.issues,
        latencyMs: Date.now() - start,
      });
      throw new VesprApiError(
        `Invalid API response: ${result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
      );
    }
    return result.data;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof VesprApiError && error.statusCode) {
      return error.statusCode >= 500 || error.statusCode === 429;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
