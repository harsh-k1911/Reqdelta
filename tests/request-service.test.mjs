import { afterEach, describe, expect, it, vi } from 'vitest';
import requestService from '../electron/request-service.cjs';

const { executeRequest } = requestService;
const request = { method: 'GET', url: 'http://localhost:3030/students/101' };

afterEach(() => vi.unstubAllGlobals());

describe('request execution', () => {
  it.each(['', 'students/101', 'file:///etc/passwd', 'ftp://example.com/file', 'http://user:secret@example.com'])('rejects an invalid or unsupported URL: %s', async (url) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await executeRequest({ ...request, url })).error.code).toBe('INVALID_URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates data in the main service even when the UI is bypassed', async () => {
    expect((await executeRequest(null)).error.code).toBe('INVALID_URL');
    expect((await executeRequest({ ...request, method: 'TRACE' })).error.code).toBe('INVALID_METHOD');
  });

  it.each(['GET', 'POST', 'PUT', 'DELETE'])('sends the chosen %s method to fetch and records it in the result', async (method) => {
    const fetchMock = vi.fn(async () => new Response('{"message":"received"}'));
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeRequest({ ...request, method });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(request.url, expect.objectContaining({ method }));
    expect(result.response.method).toBe(method);
  });

  it.each(['TRACE', 'CONNECT', 'PATCH', 'get', null])('rejects an unsupported method before making a network call: %s', async (method) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await executeRequest({ ...request, method })).error.code).toBe('INVALID_METHOD');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns JSON, headers, actual UTF-8 bytes, and total duration', async () => {
    const body = '{"name":"हर्ष"}';
    const fetchMock = vi.fn(async () => new Response(body, { status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await executeRequest(request);
    expect(result.ok).toBe(true);
    expect(result.response).toMatchObject({ status: 200, statusText: 'OK', body, format: 'json', sizeBytes: Buffer.byteLength(body) });
    expect(result.response.headers).toContainEqual({ name: 'content-type', value: 'application/json' });
    expect(result.response.durationMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps HTTP 404 responses inspectable instead of treating them as network failures', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":"Not found"}', { status: 404 }));
    const result = await executeRequest(request);
    expect(result.ok).toBe(true);
    expect(result.response.status).toBe(404);
  });

  it.each(['plain text', '<script>window.alert("untrusted")</script>', '{invalid json'])('preserves non-JSON response text: %s', async (body) => {
    vi.stubGlobal('fetch', async () => new Response(body));
    const result = await executeRequest(request);
    expect(result.response).toMatchObject({ body, format: 'text' });
  });

  it('recognizes JSON primitives and handles a response without a body', async () => {
    vi.stubGlobal('fetch', async () => new Response('null'));
    expect((await executeRequest(request)).response.format).toBe('json');
    vi.stubGlobal('fetch', async () => new Response(null, { status: 204 }));
    expect((await executeRequest(request)).response).toMatchObject({ status: 204, body: '', sizeBytes: 0 });
  });

  it('enforces the size limit on streamed bytes without relying on Content-Length', async () => {
    vi.stubGlobal('fetch', async () => new Response('a body over the limit'));
    expect((await executeRequest(request, { maxResponseBytes: 4 })).error.code).toBe('RESPONSE_TOO_LARGE');
  });

  it('times out a server that never returns headers', async () => {
    vi.stubGlobal('fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    expect((await executeRequest(request, { timeoutMs: 10 })).error.code).toBe('TIMEOUT');
  });

  it('keeps the timeout active while downloading the body', async () => {
    vi.stubGlobal('fetch', async (_url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial response'));
        signal.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true });
      },
    })));
    expect((await executeRequest(request, { timeoutMs: 10 })).error.code).toBe('TIMEOUT');
  });

  it('returns a useful error for an unreachable server without exposing stack traces', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('private internal details'); });
    const result = await executeRequest(request);
    expect(result.error.code).toBe('NETWORK_ERROR');
    expect(result.error.message).not.toContain('private internal details');
  });
});

describe('query parameters', () => {
  function mockFetch() {
    const fetchMock = vi.fn(async () => new Response('{"message":"received"}'));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function param(key, value, enabled = true) {
    return { key, value, enabled };
  }

  it('keeps existing parameters and appends repeated names before the URL fragment', async () => {
    const fetchMock = mockFetch();
    const result = await executeRequest({ ...request, url: `${request.url}?tag=original&keep=1#section`, queryParams: [param('tag', 'second'), param('tag', 'third')] });
    const expected = `${request.url}?tag=original&keep=1&tag=second&tag=third#section`;
    expect(fetchMock.mock.calls[0][0]).toBe(expected);
    expect(result.response.url).toBe(expected);
  });

  it('encodes names, spaces, delimiters, plus signs, and Unicode without creating extra parameters', async () => {
    const fetchMock = mockFetch();
    await executeRequest({ ...request, queryParams: [param('space name', 'café & + 😀')] });
    expect(fetchMock.mock.calls[0][0]).toBe(`${request.url}?space+name=caf%C3%A9+%26+%2B+%F0%9F%98%80`);
  });

  it('ignores disabled and entirely blank rows but sends explicitly named empty values', async () => {
    const fetchMock = mockFetch();
    await executeRequest({ ...request, queryParams: [param('ignored', 'secret', false), param('', ''), param('empty', '')] });
    expect(fetchMock.mock.calls[0][0]).toBe(`${request.url}?empty=`);
  });

  it('does not rewrite existing query encoding when no extra parameters are active', async () => {
    const fetchMock = mockFetch();
    const url = `${request.url}?token=a%20b&flag=1`;
    await executeRequest({ ...request, url, queryParams: [param('', ''), param('unused', 'value', false)] });
    expect(fetchMock.mock.calls[0][0]).toBe(url);
  });

  it('encodes a literal percent sign once instead of interpreting user text as pre-encoded data', async () => {
    const fetchMock = mockFetch();
    await executeRequest({ ...request, queryParams: [param('q', 'a%20b')] });
    expect(fetchMock.mock.calls[0][0]).toBe(`${request.url}?q=a%2520b`);
  });

  it('does not accumulate parameters or mutate input when the same request is sent twice', async () => {
    const fetchMock = mockFetch();
    const input = Object.freeze({ ...request, queryParams: Object.freeze([Object.freeze(param('page', '2'))]) });
    await executeRequest(input);
    await executeRequest(input);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`${request.url}?page=2`, `${request.url}?page=2`]);
    expect(input.url).toBe(request.url);
  });

  it.each([
    ['a missing name with a value', [param('', 'orphaned value')]],
    ['a whitespace-only name', [param('   ', 'value')]],
    ['a non-array parameter list', 'page=2'],
    ['a null parameter list', null],
    ['a missing row', [null]],
    ['a non-string name', [param(2, 'value')]],
    ['a non-string value', [param('page', 2)]],
    ['a missing enabled flag', [{ key: 'page', value: '2' }]],
  ])('rejects %s before sending the request', async (_description, queryParams) => {
    const fetchMock = mockFetch();
    const result = await executeRequest({ ...request, queryParams });
    expect(result.error.code).toBe('INVALID_PARAMS');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('request headers', () => {
  function mockFetch() {
    const fetchMock = vi.fn(async () => new Response('{"message":"received"}'));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function header(key, value, enabled = true) {
    return { key, value, enabled };
  }

  it('sends enabled application headers and normalizes their names', async () => {
    const fetchMock = mockFetch();
    const result = await executeRequest({ ...request, headers: [header(' Accept ', ' application/json '), header('Authorization', 'Bearer demo-token'), header('X-Demo-Client', 'ReqDelta')] });
    expect(result.ok).toBe(true);
    const sent = fetchMock.mock.calls[0][1].headers;
    expect(Object.fromEntries(sent)).toEqual({ accept: 'application/json', authorization: 'Bearer demo-token', 'x-demo-client': 'ReqDelta' });
  });

  it('ignores disabled and entirely blank rows but sends a named empty value', async () => {
    const fetchMock = mockFetch();
    await executeRequest({ ...request, headers: [header('X-Skip', 'unused', false), header('', ''), header('X-Empty', '')] });
    expect(Object.fromEntries(fetchMock.mock.calls[0][1].headers)).toEqual({ 'x-empty': '' });
  });

  it('rejects repeated enabled names without regard to capitalization', async () => {
    const fetchMock = mockFetch();
    const result = await executeRequest({ ...request, headers: [header('Accept', 'application/json'), header('accept', 'text/plain')] });
    expect(result.error.code).toBe('INVALID_HEADERS');
    expect(result.error.message).toContain('repeated');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows a disabled duplicate without changing or merging the enabled value', async () => {
    const fetchMock = mockFetch();
    await executeRequest({ ...request, headers: [header('Accept', 'application/json'), header('accept', 'text/plain', false)] });
    expect(fetchMock.mock.calls[0][1].headers.get('accept')).toBe('application/json');
  });

  it.each(['Host', 'Content-Length', 'Transfer-Encoding', 'Connection', 'Keep-Alive', 'TE', 'Trailer', 'Upgrade', 'Expect', 'Proxy-Connection'])('rejects the client-managed %s header before a network call', async (name) => {
    const fetchMock = mockFetch();
    const result = await executeRequest({ ...request, headers: [header(name, 'value')] });
    expect(result.error.code).toBe('INVALID_HEADERS');
    expect(result.error.message).toContain('automatically');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['a value without a name', [header('', 'value')]],
    ['a whitespace-only name', [header('   ', 'value')]],
    ['a name containing spaces', [header('Bad Name', 'value')]],
    ['a name containing a colon', [header('Bad:Name', 'value')]],
    ['a value containing a newline', [header('X-Test', 'first\r\nX-Injected: second')]],
    ['a value containing a null byte', [header('X-Test', 'bad\u0000value')]],
    ['a value containing unsupported characters', [header('X-Test', '😀')]],
    ['a non-array list', { Accept: 'application/json' }],
    ['a null list', null],
    ['a null row', [null]],
    ['a non-string name', [header(1, 'value')]],
    ['a non-string value', [header('X-Test', 1)]],
    ['a missing enabled flag', [{ key: 'X-Test', value: 'value' }]],
  ])('rejects %s before a network call', async (_description, headers) => {
    const fetchMock = mockFetch();
    const result = await executeRequest({ ...request, headers });
    expect(result.error.code).toBe('INVALID_HEADERS');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose header values in validation error messages', async () => {
    mockFetch();
    const result = await executeRequest({ ...request, headers: [header('Authorization', 'private-demo-secret\r\nInjected: value')] });
    expect(result.error.code).toBe('INVALID_HEADERS');
    expect(result.error.message).not.toContain('private-demo-secret');
  });

  it('does not mutate the row list or accumulate headers across sends', async () => {
    const fetchMock = mockFetch();
    const input = Object.freeze({ ...request, headers: Object.freeze([Object.freeze(header('X-Demo', 'one'))]) });
    await executeRequest(input);
    await executeRequest(input);
    expect(fetchMock.mock.calls.map(([, options]) => Object.fromEntries(options.headers))).toEqual([{ 'x-demo': 'one' }, { 'x-demo': 'one' }]);
    expect(input.headers[0].key).toBe('X-Demo');
  });
});
