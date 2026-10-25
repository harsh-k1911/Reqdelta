import { describe, expect, it, vi } from 'vitest';
import module from '../electron/comparison-service.cjs';

const { createComparisonService } = module;
const entry = (id, body, extra = {}) => ({
  id, requestName: `Student ${id}`, method: 'GET', statusCode: 200, executedAt: '2026-10-25T09:00:00.000Z',
  request: { url: 'https://example.test/?token=private' },
  outcome: { ok: true, response: { format: 'json', body } }, ...extra,
});
function setup(before = entry(1, '{"name":"Rahul","age":20}'), after = entry(2, '{"fullName":"Rahul","age":"20"}')) {
  const entries = new Map([[1, before], [2, after]]);
  const history = {
    get: vi.fn(async ({ id }) => entries.has(id) ? { ok: true, entry: entries.get(id) } : { ok: false, error: { code: 'NOT_FOUND', message: 'Snapshot is no longer available.' } }),
    append: vi.fn(),
  };
  return { history, compare: createComparisonService(history).compare, entries };
}

describe('stored JSON response comparison', () => {
  it('loads two snapshots once, returns the typed diff and minimal source labels, and does not write history', async () => {
    const { compare, history, entries } = setup();
    const original = structuredClone([...entries.values()]);
    const result = await compare({ beforeId: 1, afterId: 2 });
    expect(result).toMatchObject({ ok: true, comparison: { equal: false, before: { id: 1 }, after: { id: 2 }, counts: { added: 1, removed: 1, typeChanged: 1, valueChanged: 0, total: 3 } } });
    expect(result.comparison.changes).toEqual([
      { kind: 'typeChanged', path: '/age', beforeType: 'number', afterType: 'string', before: 20, after: '20' },
      { kind: 'added', path: '/fullName', beforeType: 'missing', afterType: 'string', after: 'Rahul' },
      { kind: 'removed', path: '/name', beforeType: 'string', afterType: 'missing', before: 'Rahul' },
    ]);
    expect(history.get.mock.calls).toEqual([[{ id: 1 }], [{ id: 2 }]]);
    expect(history.append).not.toHaveBeenCalled();
    expect([...entries.values()]).toEqual(original);
    expect(Object.keys(result.comparison.before)).toEqual(['id', 'requestName', 'method', 'statusCode', 'executedAt']);
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('reverses added/removed fields and before/after values when the IDs are swapped', async () => {
    const { compare } = setup();
    const result = await compare({ beforeId: 2, afterId: 1 });
    expect(result.comparison.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/age', before: '20', after: 20 }),
      expect.objectContaining({ path: '/name', kind: 'added' }),
      expect.objectContaining({ path: '/fullName', kind: 'removed' }),
    ]));
  });

  it('compares bodies only, allowing JSON error statuses and ignoring status, timing, formatting, and property order', async () => {
    const { compare } = setup(entry(1, '{"a":1,"b":null}'), entry(2, ' { "b": null, "a": 1.0 } ', { statusCode: 404, durationMs: 88 }));
    expect(await compare({ beforeId: 1, afterId: 2 })).toMatchObject({ ok: true, comparison: { equal: true, changes: [], counts: { total: 0 }, after: { statusCode: 404 } } });
  });

  it.each([undefined, null, [], {}, { beforeId: '1', afterId: 2 }, { beforeId: 1, afterId: -1 }, { beforeId: 1.5, afterId: 2 }, { beforeId: 1, afterId: Number.MAX_SAFE_INTEGER + 1 }, { beforeId: 1, afterId: 1 }])('rejects invalid or repeated IDs before reading storage: %j', async (input) => {
    const { compare, history } = setup();
    expect(await compare(input)).toMatchObject({ ok: false, error: { code: 'INVALID_SELECTION' } });
    expect(history.get).not.toHaveBeenCalled();
  });

  it.each(['before', 'after'])('identifies a missing %s snapshot', async (side) => {
    const { compare } = setup();
    expect(await compare({ beforeId: side === 'before' ? 3 : 1, afterId: side === 'after' ? 3 : 2 })).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: `${side === 'before' ? 'Before' : 'After'}: Snapshot is no longer available.` } });
  });

  it.each(['SECURE_STORAGE_UNAVAILABLE', 'UNREADABLE_HISTORY'])('preserves controlled storage errors: %s', async (code) => {
    const history = { get: vi.fn(async () => ({ ok: false, error: { code, message: 'Stored data could not be opened.' } })) };
    expect(await createComparisonService(history).compare({ beforeId: 1, afterId: 2 })).toEqual({ ok: false, error: { code, message: 'Before: Stored data could not be opened.' } });
    expect(history.get).toHaveBeenCalledTimes(1);
  });

  it.each(['before', 'after'])('rejects a %s network failure without pretending it is an empty JSON response', async (side) => {
    const failed = entry(side === 'before' ? 1 : 2, '', { statusCode: null, outcome: { ok: false, error: { code: 'NETWORK_ERROR', message: 'Unavailable' } } });
    const { compare } = setup(side === 'before' ? failed : entry(1, '{}'), side === 'after' ? failed : entry(2, '{}'));
    expect(await compare({ beforeId: 1, afterId: 2 })).toMatchObject({ ok: false, error: { code: 'NO_RESPONSE', message: expect.stringContaining(side === 'before' ? 'Before' : 'After') } });
  });

  it.each(['before', 'after'])('rejects %s plain text', async (side) => {
    const text = entry(side === 'before' ? 1 : 2, '', { outcome: { ok: true, response: { format: 'text', body: 'Hello' } } });
    const { compare } = setup(side === 'before' ? text : entry(1, '{}'), side === 'after' ? text : entry(2, '{}'));
    expect(await compare({ beforeId: 1, afterId: 2 })).toMatchObject({ ok: false, error: { code: 'NOT_JSON' } });
  });

  it.each([
    ['{private-invalid', 'INVALID_JSON'],
    ['9007199254740993', 'UNSUPPORTED_NUMBER'],
    [JSON.stringify(Object.fromEntries(Array.from({ length: 501 }, (_, index) => [index, true]))), 'COMPARISON_LIMIT'],
  ])('returns a controlled engine error without a partial report', async (body, code) => {
    const { compare } = setup(entry(1, '{}'), entry(2, body));
    const result = await compare({ beforeId: 1, afterId: 2 });
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(result).not.toHaveProperty('comparison');
    expect(JSON.stringify(result)).not.toContain('private-invalid');
  });

  it('does not expose unexpected storage error details', async () => {
    const history = { get: vi.fn(async () => { throw new Error('secret credential'); }) };
    const result = await createComparisonService(history).compare({ beforeId: 1, afterId: 2 });
    expect(result).toMatchObject({ ok: false, error: { code: 'COMPARISON_FAILED' } });
    expect(JSON.stringify(result)).not.toContain('secret credential');
  });
});
