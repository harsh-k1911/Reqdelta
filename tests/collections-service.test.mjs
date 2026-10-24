import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import databaseModule from '../electron/database.cjs';
import collectionsModule from '../electron/collections-service.cjs';

const { openDatabase } = databaseModule;
const { listCollections, createCollection } = collectionsModule;
let database;

beforeEach(() => { database = openDatabase(':memory:'); });
afterEach(() => { database?.close(); });

describe('collection operations', () => {
  it('lists an empty workspace and returns permanent IDs and UTC timestamps after creation', () => {
    expect(listCollections(database)).toEqual({ ok: true, collections: [] });
    const result = createCollection(database, { name: '  Student API  ' });
    expect(result.ok).toBe(true);
    expect(result.collection).toMatchObject({ id: 1, name: 'Student API' });
    expect(result.collection.createdAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(result.collection.updatedAt).toBe(result.collection.createdAt);
    expect(listCollections(database).collections).toEqual([result.collection]);
    expect(database.prepare('SELECT name FROM collections').get().name).toBe('Student API');
  });

  it('lists newest first using IDs, including creations with identical timestamps', () => {
    const first = createCollection(database, { name: 'Student API' }).collection;
    const second = createCollection(database, { name: 'Payment API' }).collection;
    database.prepare('UPDATE collections SET created_at = ?').run(first.createdAt);
    expect(listCollections(database).collections.map((row) => row.id)).toEqual([second.id, first.id]);
  });

  it('binds apostrophes, SQL-looking input, Unicode, and markup as plain name text', () => {
    const name = "Harsh's API'); DROP TABLE collections; -- café 😀 <b>test</b>";
    expect(createCollection(database, { name }).collection.name).toBe(name);
    expect(listCollections(database).collections.map((row) => row.name)).toEqual([name]);
  });

  it('allows duplicate names as separate collections with distinct IDs', () => {
    const first = createCollection(database, { name: 'Student API' }).collection;
    const second = createCollection(database, { name: 'Student API' }).collection;
    expect(second.id).not.toBe(first.id);
    expect(listCollections(database).collections).toHaveLength(2);
  });

  it.each([undefined, null, [], 'Student API', 42, {}, { name: 42 }, { name: null }, { name: '' }, { name: ' \t\n ' }, { name: 'a'.repeat(101) }, { name: 'nul\0name' }])
    ('rejects invalid input before adding a row: %j', (input) => {
      expect(createCollection(database, input)).toMatchObject({ ok: false, error: { code: 'INVALID_COLLECTION' } });
      expect(listCollections(database).collections).toHaveLength(0);
    });

  it('counts Unicode code points consistently with SQLite at the 100-character boundary', () => {
    const name = '😀'.repeat(100);
    expect(createCollection(database, { name }).collection.name).toBe(name);
    expect(createCollection(database, { name: `${name}😀` })).toMatchObject({ ok: false, error: { code: 'INVALID_COLLECTION' } });
    expect(listCollections(database).collections).toHaveLength(1);
  });

  it('returns useful errors without SQL details when the connection is unavailable', () => {
    database.close();
    expect(listCollections(database)).toEqual({ ok: false, error: { code: 'STORAGE_ERROR', message: 'Could not load collections. Try again.' } });
    expect(createCollection(database, { name: 'Student API' })).toEqual({ ok: false, error: { code: 'STORAGE_ERROR', message: 'Could not create the collection. Try again.' } });
    database = null;
  });
});
