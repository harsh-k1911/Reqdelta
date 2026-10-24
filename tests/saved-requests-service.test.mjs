import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import databaseModule from '../electron/database.cjs';
import serviceModule from '../electron/saved-requests-service.cjs';

const { openDatabase } = databaseModule;
const { createSavedRequestsService } = serviceModule;
let database;
let secureStorage;
let service;
let collectionId;

// A test double keeps payloads only in memory. The desktop check exercises the
// actual macOS encryptor; these tests need no Keychain or real credentials.
function memoryStorage() {
  const values = new Map();
  return {
    protect: vi.fn(async (value) => {
      const token = randomUUID();
      values.set(token, structuredClone(value));
      return Buffer.from(token);
    }),
    unprotect: vi.fn(async (bytes) => {
      const value = values.get(Buffer.from(bytes).toString());
      if (!value) throw new Error('Unreadable');
      return { value: structuredClone(value), replacement: null };
    }),
  };
}

function request(changes = {}) {
  return {
    method: 'POST', url: 'http://localhost:3030/echo?tag=original',
    queryParams: [{ key: 'tag', value: 'second & café', enabled: true }, { key: '', value: 'disabled draft', enabled: false }],
    headers: [{ key: 'Authorization', value: 'Bearer made-up-token', enabled: true }, { key: 'X-Draft', value: 'later', enabled: false }],
    body: { mode: 'json', text: '{\n  "name": "Harsh 😀"\n}' }, ...changes,
  };
}
const input = (changes = {}) => ({ collectionId, name: '  Student echo  ', request: request(), ...changes });
const withoutIds = (config) => ({ ...config, queryParams: config.queryParams.map(({ id: _id, ...row }) => row), headers: config.headers.map(({ id: _id, ...row }) => row) });

beforeEach(() => {
  database = openDatabase(':memory:');
  collectionId = database.prepare('INSERT INTO collections (name) VALUES (?)').run('Student API').lastInsertRowid;
  secureStorage = memoryStorage();
  service = createSavedRequestsService(database, secureStorage);
});
afterEach(() => { database?.close(); vi.unstubAllGlobals(); });

describe('saved request operations', () => {
  it('saves a complete configuration and retrieves it without executing an HTTP request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await service.create(input());
    expect(result).toMatchObject({ ok: true, savedRequest: { id: 1, collectionId, name: 'Student echo', method: 'POST' } });
    const loaded = await service.get({ id: result.savedRequest.id });
    expect(loaded.ok).toBe(true);
    expect(withoutIds(loaded.savedRequest.request)).toEqual(request());
    expect(loaded.savedRequest.request.headers[0].id).toMatch(/^[\da-f-]{36}$/);
    expect(fetch).not.toHaveBeenCalled();
    expect(database.prepare('SELECT count(*) AS total FROM request_history').get().total).toBe(0);
    expect(Object.keys(database.prepare('SELECT * FROM saved_requests').get())).not.toContain('url');
  });

  it('lists metadata by collection, newest first, without decrypting credentials', async () => {
    const secondCollection = database.prepare('INSERT INTO collections (name) VALUES (?)').run('Other API').lastInsertRowid;
    const first = await service.create(input());
    const second = await service.create(input({ name: 'Another echo' }));
    await service.create(input({ collectionId: secondCollection }));
    const result = service.list({ collectionId });
    expect(result.savedRequests.map((row) => row.id)).toEqual([second.savedRequest.id, first.savedRequest.id]);
    expect(JSON.stringify(result)).not.toContain('made-up-token');
    expect(result.savedRequests[0]).not.toHaveProperty('request');
    expect(secureStorage.unprotect).not.toHaveBeenCalled();
  });

  it.each(['GET', 'POST', 'PUT', 'DELETE'])('preserves %s configuration, including disabled rows and a None-mode draft', async (method) => {
    const config = request({ method, body: { mode: 'none', text: '{unfinished draft' } });
    const created = await service.create(input({ request: config }));
    const loaded = await service.get({ id: created.savedRequest.id });
    expect(withoutIds(loaded.savedRequest.request)).toEqual(config);
  });

  it('keeps the original URL separate from extra rows to prevent duplicate query parameters after loading', async () => {
    const result = await service.create(input());
    const loaded = await service.get({ id: result.savedRequest.id });
    expect(loaded.savedRequest.request.url).toBe('http://localhost:3030/echo?tag=original');
    expect(loaded.savedRequest.request.queryParams[0].key).toBe('tag');
  });

  it.each([undefined, null, {}, { collectionId: '1' }, { collectionId: 0 }, { collectionId: 1.2 }, { collectionId: Number.MAX_SAFE_INTEGER + 1 }])
    ('rejects invalid collection selection: %j', async (value) => {
      expect(await service.create(value)).toMatchObject({ ok: false, error: { code: 'INVALID_COLLECTION' } });
      expect(service.list(value)).toMatchObject({ ok: false, error: { code: 'INVALID_COLLECTION' } });
      expect(secureStorage.protect).not.toHaveBeenCalled();
    });

  it.each([undefined, '', '   ', 42, 'x'.repeat(101), 'nul\0name'])('rejects an invalid saved request name: %j', async (name) => {
    expect(await service.create(input({ name }))).toMatchObject({ ok: false, error: { code: 'INVALID_NAME' } });
    expect(secureStorage.protect).not.toHaveBeenCalled();
  });

  it('allows Unicode, apostrophes, and duplicate names with different permanent IDs', async () => {
    const name = "Harsh's 学生 API 😀";
    const first = await service.create(input({ name }));
    const second = await service.create(input({ name }));
    expect(first.savedRequest.name).toBe(name);
    expect(first.savedRequest.id).not.toBe(second.savedRequest.id);
  });

  it.each([
    ['missing config', null],
    ['unsupported URL', request({ url: 'file:///etc/passwd' })],
    ['unsupported method', request({ method: 'TRACE' })],
    ['missing parameter name', request({ queryParams: [{ key: '', value: 'value', enabled: true }] })],
    ['duplicate headers', request({ headers: [{ key: 'Accept', value: 'a', enabled: true }, { key: 'accept', value: 'b', enabled: true }] })],
    ['invalid JSON', request({ body: { mode: 'json', text: '{broken' } })],
    ['GET body', request({ method: 'GET' })],
  ])('rejects %s using the shared request validation before encryption', async (_description, config) => {
    expect(await service.create(input({ request: config }))).toMatchObject({ ok: false });
    expect(secureStorage.protect).not.toHaveBeenCalled();
    expect(service.list({ collectionId }).savedRequests).toHaveLength(0);
  });

  it('bounds the whole configuration, including large disabled drafts', async () => {
    const result = await service.create(input({ request: request({ body: { mode: 'none', text: 'x'.repeat(2 * 1024 * 1024) } }) }));
    expect(result).toMatchObject({ ok: false, error: { code: 'REQUEST_TOO_LARGE' } });
    expect(secureStorage.protect).not.toHaveBeenCalled();
  });

  it('reports missing collections and requests without writing or invoking encryption', async () => {
    expect(await service.create(input({ collectionId: 999 }))).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(service.list({ collectionId: 999 })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await service.get({ id: 999 })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(secureStorage.protect).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { id: '1' }, { id: -1 }, { id: 1.1 }])('rejects invalid saved request IDs: %j', async (value) => {
    expect(await service.get(value)).toMatchObject({ ok: false, error: { code: 'INVALID_ID' } });
  });

  it('keeps the database empty if secure storage refuses encryption', async () => {
    secureStorage.protect.mockRejectedValue(Object.assign(new Error('Unlock your keychain.'), { code: 'SECURE_STORAGE_UNAVAILABLE' }));
    expect(await service.create(input())).toMatchObject({ ok: false, error: { code: 'SECURE_STORAGE_UNAVAILABLE' } });
    expect(service.list({ collectionId }).savedRequests).toHaveLength(0);
  });

  it('preserves a corrupt or foreign encrypted record rather than replacing it', async () => {
    const result = await service.create(input());
    database.prepare('UPDATE saved_requests SET request_encrypted = ? WHERE id = ?').run(Buffer.from('cannot decrypt'), result.savedRequest.id);
    expect(await service.get({ id: result.savedRequest.id })).toMatchObject({ ok: false, error: { code: 'UNREADABLE_REQUEST' } });
    expect(database.prepare('SELECT request_encrypted FROM saved_requests').get().request_encrypted).toEqual(new Uint8Array(Buffer.from('cannot decrypt')));
  });

  it('rejects an unknown encrypted payload version without exposing its content', async () => {
    const result = await service.create(input());
    secureStorage.unprotect.mockResolvedValue({ value: { version: 99, secret: 'not an error message' }, replacement: null });
    const loaded = await service.get({ id: result.savedRequest.id });
    expect(loaded.error.code).toBe('UNREADABLE_REQUEST');
    expect(JSON.stringify(loaded)).not.toContain('not an error message');
  });

  it('updates only ciphertext when the OS rotates a key, keeping record metadata intact', async () => {
    const result = await service.create(input());
    const before = database.prepare('SELECT * FROM saved_requests').get();
    secureStorage.unprotect.mockResolvedValue({ value: { version: 1, request: request() }, replacement: Buffer.from('rotated ciphertext') });
    expect((await service.get({ id: result.savedRequest.id })).ok).toBe(true);
    const after = database.prepare('SELECT * FROM saved_requests').get();
    expect(after.updated_at).toBe(before.updated_at);
    expect(Buffer.from(after.request_encrypted).toString()).toBe('rotated ciphertext');
  });
});
