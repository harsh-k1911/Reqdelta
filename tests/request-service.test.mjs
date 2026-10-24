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
    expect((await executeRequest({ ...request, method: 'POST' })).error.code).toBe('INVALID_METHOD');
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
