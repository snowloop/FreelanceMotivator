import { setTimeout } from "node:timers/promises";

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
}


function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  { timeoutMs = 8000, retries = 2 }: FetchOptions = {},
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await setTimeout(500 * 2 ** (attempt - 1));
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!isRetryableStatus(response.status) || attempt === retries) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
