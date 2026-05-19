export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
    // Restore prototype chain
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

interface HttpClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number; // in milliseconds, defaults to 5000
  retries?: number; // number of retries, defaults to 2
  backoffMs?: number; // initial delay, defaults to 300ms
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes an HTTP request with AbortController timeout and exponential retries.
 * @param url Target URL string
 * @param options HTTP client settings
 */
export async function requestWithRetry(url: string, options: HttpClientOptions = {}): Promise<Response> {
  const method = options.method || 'GET';
  const headers = options.headers || {};
  const timeout = options.timeout !== undefined ? options.timeout : 5000;
  const retries = options.retries !== undefined ? options.retries : 2;
  const backoffMs = options.backoffMs !== undefined ? options.backoffMs : 300;

  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: controller.signal as any,
      };

      if (options.body) {
        fetchOptions.body = typeof options.body === 'object' ? JSON.stringify(options.body) : options.body;
      }

      const response = await fetch(url, fetchOptions);
      clearTimeout(id);
      return response;
    } catch (err: any) {
      clearTimeout(id);

      const isAbort = err.name === 'AbortError' || err.code === 'DOMException' || err.message?.includes('aborted');

      if (attempt < retries) {
        attempt++;
        const delayTime = backoffMs * Math.pow(2, attempt - 1);
        console.warn(`[HTTP Client] Attempt ${attempt} failed (${isAbort ? 'Timeout' : err.message}). Retrying in ${delayTime}ms...`);
        await delay(delayTime);
        continue;
      }

      if (isAbort) {
        throw new TimeoutError(`Request to ${url} timed out after ${timeout}ms`);
      }

      throw err;
    }
  }
}
