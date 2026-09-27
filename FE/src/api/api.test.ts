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
  it('reads a locked, missing or expired share link as an answer rather than an error', async () => {
    const { getShare } = await load();
    fetchMock.mockResolvedValueOnce(json(401));
    await expect(getShare('secret')).resolves.toEqual({ status: 'locked' });
    fetchMock.mockResolvedValueOnce(json(404));
    await expect(getShare('nope')).resolves.toEqual({ status: 'missing' });
    fetchMock.mockResolvedValueOnce(json(410));
    await expect(getShare('old')).resolves.toEqual({ status: 'expired' });
  });

  it('sends the unlock password in the body, never the URL', async () => {
    const { unlockShare } = await load();
    fetchMock.mockResolvedValueOnce(json(200, { company: 'X' }));
    await expect(unlockShare('tok', 'grocer-2026')).resolves.toEqual({ company: 'X' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/share/tok/unlock');
    expect(String(url)).not.toContain('grocer');
    expect(init).toMatchObject({ method: 'POST', body: '{"password":"grocer-2026"}' });
    fetchMock.mockResolvedValueOnce(json(401));
    await expect(unlockShare('tok', 'nope')).rejects.toMatchObject({ status: 401 });
  });

  it('reads a missing invite token as an answer rather than an error', async () => {
    const { getInvite } = await load();
    fetchMock.mockResolvedValueOnce(json(404));
    await expect(getInvite('nope')).resolves.toEqual({ status: 'missing' });
  });

  it('only sends a pin query param when one is given', async () => {
    const { getInvite } = await load();
    fetchMock.mockImplementation(async () => json(200, { expired: false, completed: false, verified: false }));
    await getInvite('tok');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/invites/tok');
    await getInvite('tok', '123456');
    expect(fetchMock.mock.calls[1][0]).toBe('http://api.test/api/invites/tok?pin=123456');
  });

  it('returns the fuller invite response once a pin verifies', async () => {
    const { getInvite } = await load();
    fetchMock.mockResolvedValueOnce(json(200, { expired: false, completed: false, verified: true, inviterCompany: 'Acme', level: 1 }));
    await expect(getInvite('tok', '123456')).resolves.toEqual({
      status: 'found',
      invite: { expired: false, completed: false, verified: true, inviterCompany: 'Acme', level: 1 },
    });
  });

  it('posts the submit body to the token-scoped submit endpoint', async () => {
    const { submitInvite } = await load();
    fetchMock.mockResolvedValueOnce(json(201, { assessmentId: 'a1' }));
    const body = {
      company: 'Acme',
      domain: null,
      profile: {},
      answers: {},
      rankingMode: 'effort' as const,
      results: {} as never,
      pin: '123456',
      shareChoice: 'both' as const,
      filledByBuyer: false,
    };
    await expect(submitInvite('tok', body)).resolves.toEqual({ assessmentId: 'a1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/invites/tok/submit');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(init!.body as string)).toMatchObject({ pin: '123456', shareChoice: 'both' });
  });

  it('passes an invite through with the PIN the BE returns when it could not email one', async () => {
    const { createInvite } = await load();
    fetchMock.mockResolvedValueOnce(
      json(201, { inviteId: 'i1', inviteUrl: 'http://app/?invite=tok', emailSent: false, stubbed: true, pin: '004321' }),
    );
    await expect(createInvite({ parentAssessmentId: 'a1', supplierName: 'Acme', supplierEmail: 'a@b.com' })).resolves.toMatchObject({
      emailSent: false,
      pin: '004321',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api.test/api/invites');
    expect(JSON.parse(init!.body as string)).toEqual({ parentAssessmentId: 'a1', supplierName: 'Acme', supplierEmail: 'a@b.com' });
  });

  it('carries no pin through when the email really sent', async () => {
    const { createInvite } = await load();
    fetchMock.mockResolvedValueOnce(json(201, { inviteId: 'i1', inviteUrl: 'http://app/?invite=tok', emailSent: true, stubbed: false }));
    const created = await createInvite({ parentAssessmentId: 'a1', supplierName: 'Acme', supplierEmail: 'a@b.com' });
    expect(created.pin).toBeUndefined();
  });

  it('reads the supply chain from the assessment-scoped path', async () => {
    const { getSupplyChain } = await load();
    const body = { company: 'Acme', invited: 1, responded: 1, respondedPct: 100, highestRiskBand: 'Low', suppliers: [] };
    fetchMock.mockResolvedValueOnce(json(200, body));
    await expect(getSupplyChain('a 1')).resolves.toEqual(body);
    expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/api/assessments/a%201/supply-chain');
  });

  it('leaves the password out entirely when no link is being handed out', async () => {
    const { createShare } = await load();
    // load() resets the module registry, so the catalog the global setup seeded is gone with it —
    // appStore reads it at import time, and hooks imports appStore. Re-seed before importing hooks.
    const [{ setCatalog }, { repoCatalog }] = await Promise.all([import('../engine/data'), import('../dev/repoCatalog')]);
    setCatalog(repoCatalog());
    const { shareRequest } = await import('./hooks');
    const state = { company: 'Acme', domain: '', profile: {}, answers: {}, rankingMode: 'effort' as const };
    // A fresh Response per call: one Response object can only be read once.
    fetchMock.mockImplementation(async () => json(201, { id: 'a1', shareUrl: 'u', expiresAt: 'e' }));

    await createShare(shareRequest(state));
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).not.toHaveProperty('password');

    await createShare(shareRequest(state, 'grocer-2026'));
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toMatchObject({ password: 'grocer-2026' });
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
