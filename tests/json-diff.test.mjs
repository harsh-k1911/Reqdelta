import { describe, expect, it } from 'vitest';
import comparisonModule from '../electron/json-diff.cjs';

const { compareJsonBodies, JsonComparisonError } = comparisonModule;
const compare = (before, after) => compareJsonBodies(JSON.stringify(before), JSON.stringify(after));

describe('recursive JSON comparison', () => {
  it.each([null, false, true, 0, 1.25, '', 'Rahul', [], {}, { nested: [1, null, { active: true }] }])
    ('reports equal JSON with no changes: %j', (value) => {
      expect(compare(value, value)).toEqual({ equal: true, counts: { added: 0, removed: 0, typeChanged: 0, valueChanged: 0, total: 0 }, changes: [] });
    });

  it('finds the three changes in the original student example without guessing a rename', () => {
    const result = compare({ id: 101, name: 'Rahul', age: 20, active: true }, { id: 101, fullName: 'Rahul', age: '20', active: true });
    expect(result.equal).toBe(false);
    expect(result.counts).toEqual({ added: 1, removed: 1, typeChanged: 1, valueChanged: 0, total: 3 });
    expect(result.changes).toEqual([
      { kind: 'typeChanged', path: '/age', beforeType: 'number', afterType: 'string', before: 20, after: '20' },
      { kind: 'added', path: '/fullName', beforeType: 'missing', afterType: 'string', after: 'Rahul' },
      { kind: 'removed', path: '/name', beforeType: 'string', afterType: 'missing', before: 'Rahul' },
    ]);
  });

  it('ignores whitespace, object key order, equivalent number notation, and escaped string notation', () => {
    expect(compareJsonBodies(' { "b": [true, null], "a": 1.0, "name": "\\u0052ahul" } ', '{"name":"Rahul","a":1e0,"b":[true,null]}').equal).toBe(true);
    expect(compareJsonBodies('-0', '0').equal).toBe(true);
  });

  it('reports nested leaf values with their complete path', () => {
    const before = { student: { address: { city: 'Pune' } } };
    const after = { student: { address: { city: 'Mumbai' } } };
    expect(compare(before, after).changes).toEqual([{ kind: 'valueChanged', path: '/student/address/city', beforeType: 'string', afterType: 'string', before: 'Pune', after: 'Mumbai' }]);
  });

  it.each([
    [null, {}, 'null', 'object'],
    [{}, [], 'object', 'array'],
    [[], null, 'array', 'null'],
    [false, 0, 'boolean', 'number'],
    [0, '0', 'number', 'string'],
  ])('reports a root type replacement once: %j → %j', (before, after, beforeType, afterType) => {
    expect(compare(before, after).changes).toEqual([{ kind: 'typeChanged', path: '', beforeType, afterType, before, after }]);
  });

  it.each([[false, true], [0, 1], ['', 'new'], ['café', '学生 😀']])('reports a root value change: %j → %j', (before, after) => {
    expect(compare(before, after).changes).toEqual([{ kind: 'valueChanged', path: '', beforeType: typeof before, afterType: typeof after, before, after }]);
  });

  it('keeps missing members distinct from null, false, zero, and empty strings', () => {
    const result = compare({}, { a: null, b: false, c: 0, d: '' });
    expect(result.counts.added).toBe(4);
    expect(result.changes[0]).toMatchObject({ kind: 'added', beforeType: 'missing', afterType: 'null', after: null });
    for (const change of result.changes) expect(change).not.toHaveProperty('before');
    const removed = compare({ a: null }, {}).changes[0];
    expect(removed).toEqual({ kind: 'removed', path: '/a', beforeType: 'null', afterType: 'missing', before: null });
    expect(removed).not.toHaveProperty('after');
  });

  it('reports an added or removed branch once rather than expanding all its leaves', () => {
    const branch = { address: { city: 'Pune', zip: 411001 }, tags: ['student', 'active'] };
    expect(compare({}, { student: branch }).changes).toEqual([{ kind: 'added', path: '/student', beforeType: 'missing', afterType: 'object', after: branch }]);
    expect(compare({ student: branch }, {}).changes).toEqual([{ kind: 'removed', path: '/student', beforeType: 'object', afterType: 'missing', before: branch }]);
  });

  it('reports replacing an object with an array once, without inventing child removals', () => {
    expect(compare({ item: { id: 1 } }, { item: [1] }).changes).toEqual([{ kind: 'typeChanged', path: '/item', beforeType: 'object', afterType: 'array', before: { id: 1 }, after: [1] }]);
  });

  it('compares nested arrays by index and reports trailing additions/removals', () => {
    const result = compare({ items: [{ price: 10 }, 'old'] }, { items: [{ price: 12 }, 'old', null] });
    expect(result.changes.map(({ kind, path }) => ({ kind, path }))).toEqual([{ kind: 'valueChanged', path: '/items/0/price' }, { kind: 'added', path: '/items/2' }]);
    expect(compare([1, 2], [1]).changes).toEqual([{ kind: 'removed', path: '/1', beforeType: 'number', afterType: 'missing', before: 2 }]);
  });

  it('treats inserted/reordered array members by index, without ID matching or move detection', () => {
    expect(compare([1, 2], [0, 1, 2]).changes.map(({ kind, path }) => ({ kind, path }))).toEqual([
      { kind: 'valueChanged', path: '/0' }, { kind: 'valueChanged', path: '/1' }, { kind: 'added', path: '/2' },
    ]);
    expect(compare([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }]).changes.map((change) => change.path)).toEqual(['/0/id', '/1/id']);
  });

  it('escapes slash and tilde keys, and distinguishes an empty key from the root', () => {
    expect(compare({ 'a/b': { '~key': 1 } }, { 'a/b': { '~key': 2 } }).changes[0].path).toBe('/a~1b/~0key');
    expect(compare({ '': 1 }, { '': 2 }).changes[0].path).toBe('/');
    expect(compare({ '~1': 1 }, { '~1': 2 }).changes[0].path).toBe('/~01');
  });

  it('handles prototype-looking JSON keys as ordinary own properties', () => {
    const result = compareJsonBodies('{"__proto__":{"polluted":1},"constructor":1,"toString":"old"}', '{"__proto__":{"polluted":2},"constructor":2,"toString":"new"}');
    expect(result.changes.map((change) => change.path)).toEqual(['/__proto__/polluted', '/constructor', '/toString']);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('uses stable alphabetical property ordering for reports', () => {
    expect(compareJsonBodies('{"z":1,"a":2}', '{"b":4,"z":3,"a":5}').changes.map((change) => change.path)).toEqual(['/a', '/b', '/z']);
  });

  it.each(['', ' ', 'undefined', 'NaN', '{broken', '{"token":"made-up-secret",}'])('rejects malformed JSON without repeating the response text: %j', (body) => {
    expect(() => compareJsonBodies(body, '{}')).toThrow('First response is not valid JSON.');
    try { compareJsonBodies(body, '{}'); } catch (error) {
      expect(error).toBeInstanceOf(JsonComparisonError);
      expect(error.code).toBe('INVALID_JSON');
      expect(error.message).not.toContain('made-up-secret');
    }
  });

  it('labels the second input when its JSON is malformed, and rejects non-text inputs', () => {
    expect(() => compareJsonBodies('{}', '{broken')).toThrow('Second response is not valid JSON.');
    expect(() => compareJsonBodies({}, '{}')).toThrow('First response must contain JSON text.');
  });

  it.each(['9007199254740992', '-9007199254740993', '1e400', '{"added":{"id":9007199254740993}}'])('refuses unsafe integers/non-finite numbers, including inside an added branch: %s', (body) => {
    try { compareJsonBodies('{}', body); throw new Error('Expected rejection'); } catch (error) {
      expect(error).toBeInstanceOf(JsonComparisonError);
      expect(error.code).toBe('UNSUPPORTED_NUMBER');
    }
  });

  it('accepts safe integer boundaries and ordinary decimals', () => {
    expect(compareJsonBodies('9007199254740991', '9007199254740990').counts.valueChanged).toBe(1);
    expect(compareJsonBodies('0.1', '0.2').counts.valueChanged).toBe(1);
  });

  it('measures the body limit in UTF-8 bytes rather than JavaScript string length', () => {
    const body = `"${'é'.repeat(1024 * 1024)}"`;
    expect(body.length).toBeLessThan(2 * 1024 * 1024);
    expect(() => compareJsonBodies(body, 'null')).toThrow('First response exceeds the 2 MiB comparison limit.');
  });

  it('accepts nesting at its limit and rejects a deeper added branch before walking differences', () => {
    const nested = (depth) => '{"child":'.repeat(depth) + '0' + '}'.repeat(depth);
    expect(compareJsonBodies(nested(128), nested(128)).equal).toBe(true);
    expect(() => compareJsonBodies('{}', nested(129))).toThrow('JSON nesting exceeds the 128-level comparison limit.');
  });

  it('bounds the combined number of values, including otherwise equal inputs', () => {
    const boundary = JSON.stringify(Array(49_999).fill(0));
    expect(compareJsonBodies(boundary, boundary).equal).toBe(true);
    const tooMany = JSON.stringify(Array(50_000).fill(0));
    expect(() => compareJsonBodies(tooMany, tooMany)).toThrow('100,000-value comparison limit');
  });

  it('allows 500 changes and rejects a larger report rather than returning a partial result', () => {
    const members = (length) => Object.fromEntries(Array.from({ length }, (_, index) => [`field${index}`, index]));
    expect(compare({}, members(500)).counts.total).toBe(500);
    expect(() => compare({}, members(501))).toThrow('500-change limit');
  });

  it('bounds repeated long paths in the report even when both inputs are small enough', () => {
    const key = 'x'.repeat(20_000);
    const before = { [key]: Object.fromEntries(Array.from({ length: 450 }, (_, index) => [`field${index}`, 0])) };
    const after = { [key]: Object.fromEntries(Array.from({ length: 450 }, (_, index) => [`field${index}`, 1])) };
    expect(() => compare(before, after)).toThrow('8 MiB report limit');
  });
});
