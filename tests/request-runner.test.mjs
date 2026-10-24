import { describe, expect, it, vi } from 'vitest';
import runnerModule from '../electron/request-runner.cjs';

const { createRequestRunner } = runnerModule;
const request = () => ({ method: 'GET', url: 'http://localhost/students', queryParams: [], headers: [], body: { mode: 'none', text: '' } });
const response = { method: 'GET', url: 'http://localhost/students', status: 200, statusText: 'OK', headers: [], body: '{}', format: 'json', sizeBytes: 2, durationMs: 12 };

describe('request execution with history', () => {
  it('executes once, then records the completed outcome with the original configuration', async () => {
    const execute = vi.fn(async () => ({ ok: true, response }));
    const history = { append: vi.fn(async () => ({ ok: true, id: 7 })) };
    const result = await createRequestRunner(execute, history)({ ...request(), savedRequestId: 3 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(history.append).toHaveBeenCalledWith(expect.objectContaining({ request: request(), savedRequestId: 3, outcome: { ok: true, response }, durationMs: 12, executedAt: expect.stringMatching(/T.*Z$/) }));
    expect(result).toEqual({ ok: true, response, history: { saved: true, id: 7 } });
  });

  it.each(['NETWORK_ERROR', 'TIMEOUT', 'RESPONSE_TOO_LARGE'])('records %s as a failure with measured duration', async (code) => {
    const outcome = { ok: false, error: { code, message: 'Failure details' } };
    const history = { append: vi.fn(async () => ({ ok: true, id: 8 })) };
    const result = await createRequestRunner(vi.fn(async () => outcome), history)(request());
    expect(result).toMatchObject({ ...outcome, history: { saved: true, id: 8 } });
    expect(history.append.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it.each([{}, { ...request(), url: 'file:///bad' }, { ...request(), savedRequestId: '3' }])('rejects invalid input before any HTTP call or history write', async (input) => {
    const execute = vi.fn();
    const history = { append: vi.fn() };
    expect(await createRequestRunner(execute, history)(input)).toMatchObject({ ok: false });
    expect(execute).not.toHaveBeenCalled();
    expect(history.append).not.toHaveBeenCalled();
  });

  it('preserves a real response and warns when history saving fails, without retrying the API', async () => {
    const execute = vi.fn(async () => ({ ok: true, response }));
    const history = { append: vi.fn(async () => ({ ok: false, error: { message: 'Keychain unavailable.' } })) };
    const result = await createRequestRunner(execute, history)(request());
    expect(result).toEqual({ ok: true, response, history: { saved: false, message: 'Keychain unavailable.' } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('preserves the network error even when the history writer unexpectedly throws', async () => {
    const outcome = { ok: false, error: { code: 'NETWORK_ERROR', message: 'No server' } };
    const result = await createRequestRunner(vi.fn(async () => outcome), { append: vi.fn(async () => { throw new Error('private database details'); }) })(request());
    expect(result).toMatchObject({ ...outcome, history: { saved: false } });
    expect(JSON.stringify(result)).not.toContain('private database details');
  });

  it('records an unexpected executor failure without exposing its private error text', async () => {
    const history = { append: vi.fn(async () => ({ ok: true, id: 9 })) };
    const result = await createRequestRunner(vi.fn(async () => { throw new Error('secret'); }), history)(request());
    expect(result).toMatchObject({ ok: false, error: { code: 'REQUEST_ERROR' }, history: { saved: true } });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
