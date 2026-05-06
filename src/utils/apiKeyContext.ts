import { AsyncLocalStorage } from "async_hooks";

export const apiKeyContext = new AsyncLocalStorage<string | undefined>();

export function getCurrentApiKey(): string | undefined {
  return apiKeyContext.getStore();
}
