// Inlined at build time: set VITE_API_URL in Railway *before* the FE build.
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const hasApi = API_URL !== '';

/** A failed BE call. `status` is null when no response arrived (offline, CORS, DNS, BE down). */
export class ApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number | null,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  /** Sent as JSON. */
  body?: unknown;
  signal?: AbortSignal;
}

/** Every BE call goes through this. Errors are reported to Sentry once, by the QueryClient, after retries. */
export async function request<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  if (!hasApi) throw new Error('VITE_API_URL is not set');
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(path, null, `${method} ${path}: no response`, err);
  }
  if (!res.ok) throw new ApiError(path, res.status, `${method} ${path} failed (${res.status})`);
  return (await res.json()) as T;
}
