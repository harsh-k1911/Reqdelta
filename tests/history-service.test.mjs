import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import databaseModule from '../electron/database.cjs';
import historyModule from '../electron/history-service.cjs';

const { openDatabase } = databaseModule;
const { createHistoryService } = historyModule;
let database;
let storage;
let history;
const request = () => ({ method: 'GET', url: 'http://localhost/students?token=made-up-secret', queryParams: [], headers: [], body: { mode: 'none', text: '' } });
const outcome = (changes = {}) => ({ ok: true, response: { method: 'GET', url: 'http://localhost/students?token=made-up-secret', status: 200, statusText: 'OK', headers: [{ name: 'content-type', value: 'application/json' }], body: '{"age":20}', format: 'json', sizeBytes: 10, durationMs: 12, ...changes } });
const execution = (changes = {}) => ({ request: request(), outcome: outcome(), savedRequestId: null, durationMs: 12, executedAt: '2026-10-25T00:00:00.000Z', ...changes });

beforeEach(() => {
  database = openDatabase(':memory:');
  const values = new Map();
  storage = {
    protect: vi.fn(async (value) => { const id = randomUUID(); values.set(id, structuredClone(value)); return Buffer.from(id); }),
    unprotect: vi.fn(async (bytes) => { const value = values.get(Buffer.from(bytes).toString()); if (!value) throw new Error('Unreadable'); return { value: structuredClone(value), replacement: null }; }),
  };
  history = createHistoryService(database, storage);
});
afterEach(() => { database?.close(); vi.unstubAllGlobals(); });

describe('encrypted execution history', () => {
  it('stores an independent request/response snapshot and opens it without calling an API', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const input = execution();
    const saved = await history.append(input);
    input.request.url = 'http://localhost/changed';
    input.outcome.response.body = '{"age":99}';
    const loaded = await history.get({ id: saved.id });
    expect(loaded.ok).toBe(true);
    expect(loaded.entry.request.url).toBe(request().url);
    expect(loaded.entry.outcome.response.body).toBe('{"age":20}');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(Object.keys(database.prepare('SELECT * FROM request_history').get())).not.toContain('request_snapshot_json');
  });

  it('lists only metadata without decrypting payloads, including HTTP 404 as a response', async () => {
    await history.append(execution({ outcome: outcome({ status: 404, statusText: 'Not Found' }) }));
    const result = history.list();
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ method: 'GET', statusCode: 404, errorCode: null });
    expect(JSON.stringify(result)).not.toContain('made-up-secret');
    expect(storage.unprotect).not.toHaveBeenCalled();
  });

  it('stores network failures without inventing an HTTP response', async () => {
    const failed = { ok: false, error: { code: 'NETWORK_ERROR', message: 'Could not reach the API.' } };
    const saved = await history.append(execution({ outcome: failed }));
    expect(history.list().entries[0]).toMatchObject({ statusCode: null, errorCode: 'NETWORK_ERROR' });
    expect((await history.get({ id: saved.id })).entry.outcome).toEqual(failed);
  });

  it('preserves text and empty response bodies', async () => {
    for (const body of ['plain text café', '']) {
      const saved = await history.append(execution({ outcome: outcome({ body, format: 'text' }) }));
      expect((await history.get({ id: saved.id })).entry.outcome.response.body).toBe(body);
    }
  });

  it('keeps a snapshot when its original saved request is edited or deleted', async () => {
    const collectionId = database.prepare('INSERT INTO collections (name) VALUES (?)').run('Student API').lastInsertRowid;
    const savedId = database.prepare('INSERT INTO saved_requests (collection_id, name, method, request_encrypted) VALUES (?, ?, ?, ?)')
      .run(collectionId, 'Get student', 'GET', Buffer.from('fake saved request')).lastInsertRowid;
    const saved = await history.append(execution({ savedRequestId: savedId }));
    expect(history.list().entries[0].requestName).toBe('Get student');
    database.prepare('UPDATE saved_requests SET request_encrypted = ? WHERE id = ?').run(Buffer.from('new fake configuration'), savedId);
    database.prepare('DELETE FROM collections WHERE id = ?').run(collectionId);
    const loaded = await history.get({ id: saved.id });
    expect(loaded.entry.savedRequestId).toBeNull();
    expect(loaded.entry.outcome.response.body).toBe('{"age":20}');
  });

  it('detaches a stale saved request link while preserving the execution', async () => {
    const saved = await history.append(execution({ savedRequestId: 999 }));
    expect((await history.get({ id: saved.id })).entry.savedRequestId).toBeNull();
  });

  it('keeps the newest entries under a count limit', async () => {
    history = createHistoryService(database, storage, { maxEntries: 2 });
    for (let i = 0; i < 3; i += 1) expect((await history.append(execution())).ok).toBe(true);
    expect(history.list().entries.map((entry) => entry.id)).toEqual([3, 2]);
    expect(await history.get({ id: 1 })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('also prunes to the encrypted byte budget', async () => {
    history = createHistoryService(database, storage, { maxBytes: 80 }); // Test ciphertext tokens are 36 bytes.
    for (let i = 0; i < 3; i += 1) await history.append(execution());
    expect(history.list().entries.map((entry) => entry.id)).toEqual([3, 2]);
    expect(database.prepare('SELECT sum(length(snapshot_encrypted)) AS bytes FROM request_history').get().bytes).toBe(72);
  });

  it('rolls back the insert too when pruning fails, preserving existing history', async () => {
    history = createHistoryService(database, storage, { maxEntries: 1 });
    await history.append(execution());
    database.exec("CREATE TRIGGER fail_prune BEFORE DELETE ON request_history BEGIN SELECT RAISE(ABORT, 'blocked deletion'); END;");
    expect(await history.append(execution())).toMatchObject({ ok: false, error: { code: 'HISTORY_WRITE_FAILED' } });
    expect(history.list().entries.map((entry) => entry.id)).toEqual([1]);
    database.exec('BEGIN IMMEDIATE; COMMIT;');
  });

  it('pages by an ID cursor without duplicating entries if a new execution arrives', async () => {
    for (let i = 0; i < 23; i += 1) await history.append(execution());
    const first = history.list();
    expect(first.entries).toHaveLength(20);
    expect(first.nextBeforeId).toBe(4);
    await history.append(execution());
    const next = history.list({ beforeId: first.nextBeforeId });
    expect(next.entries.map((entry) => entry.id)).toEqual([3, 2, 1]);
    expect(next.nextBeforeId).toBeNull();
  });

  it.each([null, [], { beforeId: '3' }, { beforeId: -1 }])('rejects an invalid list cursor: %j', (input) => {
    expect(history.list(input)).toMatchObject({ ok: false, error: { code: 'INVALID_CURSOR' } });
  });

  it.each([undefined, {}, { id: '1' }, { id: 0 }])('rejects invalid snapshot IDs: %j', async (input) => {
    expect(await history.get(input)).toMatchObject({ ok: false, error: { code: 'INVALID_ID' } });
  });

  it('keeps old entries intact if encryption fails', async () => {
    await history.append(execution());
    storage.protect.mockRejectedValue(Object.assign(new Error('Unlock the keychain.'), { code: 'SECURE_STORAGE_UNAVAILABLE' }));
    expect(await history.append(execution())).toMatchObject({ ok: false, error: { code: 'SECURE_STORAGE_UNAVAILABLE' } });
    expect(history.list().entries).toHaveLength(1);
  });

  it('rejects a snapshot above the plaintext size limit before encrypting it', async () => {
    const result = await history.append(execution({ outcome: outcome({ body: 'x'.repeat(16 * 1024 * 1024), format: 'text' }) }));
    expect(result).toMatchObject({ ok: false, error: { code: 'HISTORY_TOO_LARGE' } });
    expect(storage.protect).not.toHaveBeenCalled();
  });

  it('keeps an unreadable record and rejects malformed decoded JSON response data', async () => {
    const saved = await history.append(execution());
    storage.unprotect.mockResolvedValue({ value: { version: 1, request: request(), outcome: outcome({ body: '{broken' }) }, replacement: null });
    expect(await history.get({ id: saved.id })).toMatchObject({ ok: false, error: { code: 'UNREADABLE_HISTORY' } });
    expect(history.list().entries).toHaveLength(1);
  });

  it('rotates ciphertext without changing the stored execution time or outcome metadata', async () => {
    const saved = await history.append(execution());
    storage.unprotect.mockResolvedValue({ value: { version: 1, request: request(), outcome: outcome() }, replacement: Buffer.from('rotated bytes') });
    expect((await history.get({ id: saved.id })).entry.executedAt).toBe('2026-10-25T00:00:00.000Z');
    expect(Buffer.from(database.prepare('SELECT snapshot_encrypted FROM request_history').get().snapshot_encrypted).toString()).toBe('rotated bytes');
  });
});
