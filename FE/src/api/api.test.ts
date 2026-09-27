import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/react', () => ({ captureException }));

const fetchMock = vi.fn<typeof fetch>();
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** hasApi is read from the env when the module loads, so each test gets fresh modules. */
async function load(apiUrl = 'http://api.test/') {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', apiUrl);
  const [client, endpoints, queries, lib] = await Promise.all([
    import('./client'),
    import('./endpoints'),
    import('./queries'),
    import('../lib/queryClient'),
  ]);
  return { ...client, ...endpoints, ...queries, ...lib };
}

beforeEach(() => {
  captureException.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('sends JSON to the configured base URL and returns the parsed body', async () => {
    const { request } = await load();
    fetchMock.mockResolvedValue(json(200, { reply: 'hi' }));
    await expect(request('/api/chat', { method: 'POST', body: { message: 'x' } })).resolves.toEqual({ reply: 'hi' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/chat');
    expect(init).toMatchObject({ method: 'POST', body: '{"message":"x"}', headers: { 'content-type': 'application/json' } });
  });

  it('turns a bad status and a missing response into ApiErrors', async () => {
    const { request, ApiError } = await load();
    fetchMock.mockResolvedValueOnce(json(503));
    await expect(request('/api/x')).rejects.toMatchObject({ name: 'ApiError', path: '/api/x', status: 503 });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await request('/api/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: null });
  });

  it('refuses to call anything without VITE_API_URL', async () => {
    const { request } = await load('');
    await expect(request('/api/x')).rejects.toThrow('VITE_API_URL is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('endpoints', () => {
  it('reads a missing or expired share link as an answer rather than an error', async () => {
    const { getShare } = await load();
    fetchMock.mockResolvedValueOnce(json(404));
    await expect(getShare('nope')).resolves.toEqual({ status: 'missing' });
    fetchMock.mockResolvedValueOnce(json(410));
    await expect(getShare('old')).resolves.toEqual({ status: 'expired' });
  });
});

describe('query client', () => {
  it('retries only when another attempt could succeed', async () => {
    const { shouldRetry, ApiError } = await load();
    expect(shouldRetry(0, new ApiError('/x', null, 'offline'))).toBe(true);
    expect(shouldRetry(0, new ApiError('/x', 502, 'bad gateway'))).toBe(true);
    expect(shouldRetry(2, new ApiError('/x', 502, 'bad gateway'))).toBe(false);
    expect(shouldRetry(0, new ApiError('/x', 429, 'slow down'))).toBe(false);
    expect(shouldRetry(0, new SyntaxError('bad json'))).toBe(false);
  });

  it('reports a failed query once, and never one marked silent', async () => {
    const { createQueryClient } = await load();
    const client = createQueryClient();
    fetchMock.mockResolvedValue(json(400));
    const { request } = await import('./client');
    await expect(client.fetchQuery({ queryKey: ['a'], queryFn: () => request('/api/a') })).rejects.toThrow();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][1]).toEqual({ tags: { api_path: '/api/a', status: 400 } });

    captureException.mockReset();
    await expect(client.fetchQuery({ queryKey: ['b'], queryFn: () => request('/api/b'), meta: { silent: true } })).rejects.toThrow();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('uses the BE domain check when it answers, and caches it per domain', async () => {
    const { createQueryClient, domainCheckQuery } = await load();
    fetchMock.mockResolvedValue(json(200, { domain: 'example.ca', checkedAt: null, cached: true }));
    const client = createQueryClient();
    await expect(client.fetchQuery(domainCheckQuery('example.ca'))).resolves.toMatchObject({ domain: 'example.ca', cached: true });
    await client.fetchQuery(domainCheckQuery('example.ca'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/dns/example.ca');
  });

  it('falls back to the browser DNS check when the BE is unreachable, and reports it', async () => {
    const { createQueryClient, domainCheckQuery } = await load();
    fetchMock.mockImplementation(async (input) => {
      if (String(input).startsWith('http://api.test/')) throw new TypeError('Failed to fetch');
      return json(200, { Status: 0, Answer: [] });
    });
    const result = await createQueryClient().fetchQuery(domainCheckQuery('example.ca'));
    expect(result.domain).toBe('example.ca');
    expect(fetchMock.mock.calls.some(([u]) => !String(u).startsWith('http://api.test/'))).toBe(true);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
