import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import databaseModule from '../electron/database.cjs';

const { openDatabase } = databaseModule;
const connections = new Set();
const folders = [];
const requestSnapshot = JSON.stringify({ method: 'GET', url: 'http://localhost:3030/students/101' });
const responseSnapshot = JSON.stringify({ status: 200, body: '{"name":"Rahul"}', format: 'json' });
const snapshotBytes = Buffer.from('opaque fake execution snapshot');

function track(database) {
  connections.add(database);
  return database;
}

function close(database) {
  database.close();
  connections.delete(database);
}

function temporaryFile() {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'reqdelta-db-test-'));
  folders.push(folder);
  return path.join(folder, 'nested', 'workspace.sqlite');
}

function addRequest(database) {
  const collection = database.prepare('INSERT INTO collections (name) VALUES (?)').run('Student API');
  const saved = database.prepare('INSERT INTO saved_requests (collection_id, name, method, request_encrypted) VALUES (?, ?, ?, ?)')
    .run(collection.lastInsertRowid, 'Get student', 'GET', Buffer.from('fake ciphertext for database tests'));
  return { collectionId: collection.lastInsertRowid, requestId: saved.lastInsertRowid };
}

function addHistory(database, requestId) {
  database.prepare('INSERT INTO request_history (saved_request_id, method, status_code, snapshot_encrypted, duration_ms) VALUES (?, ?, ?, ?, ?)')
    .run(requestId, 'GET', 200, snapshotBytes, 12);
}

function addLegacyHistory(database, requestId) {
  database.prepare('INSERT INTO request_history (saved_request_id, request_snapshot_json, response_snapshot_json, duration_ms) VALUES (?, ?, ?, ?)')
    .run(requestId, requestSnapshot, responseSnapshot, 12);
}

function legacyDatabase(filename) {
  mkdirSync(path.dirname(filename), { recursive: true });
  const database = track(new DatabaseSync(filename));
  database.exec(readFileSync(new URL('../electron/migrations/001-initial.sql', import.meta.url), 'utf8'));
  database.exec('PRAGMA user_version = 1; PRAGMA foreign_keys = ON;');
  return database;
}

afterEach(() => {
  for (const database of connections) database.close();
  connections.clear();
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
  folders.length = 0;
});

describe('SQLite storage foundation', () => {
  it('creates a missing directory, empty tables, schema version, and foreign-key enforcement', () => {
    const database = track(openDatabase(temporaryFile()));
    expect(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all().map((row) => row.name))
      .toEqual(['collections', 'request_history', 'saved_requests']);
    expect(database.prepare('PRAGMA user_version').get().user_version).toBe(3);
    expect(database.prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);
    for (const table of ['collections', 'saved_requests', 'request_history']) {
      expect(database.prepare(`SELECT count(*) AS total FROM ${table}`).get().total).toBe(0);
    }
  });

  it('persists linked records and applies the initial migration only once', () => {
    const filename = temporaryFile();
    let database = track(openDatabase(filename));
    const { requestId } = addRequest(database);
    addHistory(database, requestId);
    close(database);
    database = track(openDatabase(filename));
    expect(database.prepare('PRAGMA user_version').get().user_version).toBe(3);
    expect(database.prepare('SELECT name FROM collections').get().name).toBe('Student API');
    expect(database.prepare('SELECT count(*) AS total FROM saved_requests').get().total).toBe(1);
    expect(Buffer.from(database.prepare('SELECT snapshot_encrypted FROM request_history').get().snapshot_encrypted)).toEqual(snapshotBytes);
    expect(database.prepare('SELECT executed_at FROM request_history').get().executed_at).toMatch(/T.*Z$/);
  });

  it('rejects a saved request with no existing parent collection', () => {
    const database = track(openDatabase(':memory:'));
    expect(() => database.prepare('INSERT INTO saved_requests (collection_id, name, method, request_encrypted) VALUES (?, ?, ?, ?)')
      .run(999, 'Orphan', 'GET', Buffer.from('fake ciphertext'))).toThrow(/FOREIGN KEY/);
  });

  it('removes a deleted collection’s saved requests while keeping independent history snapshots', () => {
    const database = track(openDatabase(':memory:'));
    const { collectionId, requestId } = addRequest(database);
    addHistory(database, requestId);
    database.prepare('DELETE FROM collections WHERE id = ?').run(collectionId);
    expect(database.prepare('SELECT count(*) AS total FROM saved_requests').get().total).toBe(0);
    expect(database.prepare('SELECT * FROM request_history').get()).toMatchObject({ saved_request_id: null, status_code: 200 });
    expect(Buffer.from(database.prepare('SELECT snapshot_encrypted FROM request_history').get().snapshot_encrypted)).toEqual(snapshotBytes);
  });

  it('preserves old history when a saved request is edited or deleted directly', () => {
    const database = track(openDatabase(':memory:'));
    const { requestId } = addRequest(database);
    addHistory(database, requestId);
    database.prepare('UPDATE saved_requests SET request_encrypted = ? WHERE id = ?').run(Buffer.from('changed fake ciphertext'), requestId);
    expect(Buffer.from(database.prepare('SELECT snapshot_encrypted FROM request_history').get().snapshot_encrypted)).toEqual(snapshotBytes);
    database.prepare('DELETE FROM saved_requests WHERE id = ?').run(requestId);
    expect(database.prepare('SELECT saved_request_id FROM request_history').get().saved_request_id).toBeNull();
  });

  it.each(['', '   ', 'a'.repeat(101)])('rejects an invalid collection name: %s', (name) => {
    const database = track(openDatabase(':memory:'));
    expect(() => database.prepare('INSERT INTO collections (name) VALUES (?)').run(name)).toThrow(/CHECK/);
  });

  it.each([
    ['blank name', { name: ' ' }],
    ['unknown method', { method: 'TRACE' }],
    ['empty ciphertext', { request_encrypted: Buffer.alloc(0) }],
    ['text instead of bytes', { request_encrypted: 'not a blob' }],
    ['oversized ciphertext', { request_encrypted: Buffer.alloc(3145729) }],
  ])('enforces the saved-request constraint for %s', (_description, changes) => {
    const database = track(openDatabase(':memory:'));
    const { collectionId } = addRequest(database);
    const row = { name: 'New request', method: 'GET', request_encrypted: Buffer.from('fake ciphertext'), ...changes };
    expect(() => database.prepare(`INSERT INTO saved_requests
      (collection_id, name, method, request_encrypted)
      VALUES (?, ?, ?, ?)`).run(collectionId, row.name, row.method, row.request_encrypted)).toThrow();
  });

  it('stores a network failure without requiring a saved request or HTTP response', () => {
    const database = track(openDatabase(':memory:'));
    database.prepare('INSERT INTO request_history (method, error_code, snapshot_encrypted, duration_ms) VALUES (?, ?, ?, ?)')
      .run('GET', 'NETWORK_ERROR', snapshotBytes, 10);
    expect(database.prepare('SELECT * FROM request_history').get()).toMatchObject({ saved_request_id: null, status_code: null, error_code: 'NETWORK_ERROR', duration_ms: 10 });
  });

  it('rejects ambiguous history records and negative durations', () => {
    const database = track(openDatabase(':memory:'));
    expect(() => database.prepare('INSERT INTO request_history (method, snapshot_encrypted, duration_ms) VALUES (?, ?, ?)').run('GET', snapshotBytes, 0)).toThrow(/CHECK/);
    expect(() => database.prepare('INSERT INTO request_history (method, snapshot_encrypted, status_code, error_code, duration_ms) VALUES (?, ?, ?, ?, ?)')
      .run('GET', snapshotBytes, 200, 'NETWORK_ERROR', 0)).toThrow(/CHECK/);
    expect(() => database.prepare('INSERT INTO request_history (method, snapshot_encrypted, status_code, duration_ms) VALUES (?, ?, ?, ?)')
      .run('GET', snapshotBytes, 200, -1)).toThrow(/CHECK/);
  });

  it('rolls back a failed migration without leaving partial tables or changing old data', () => {
    const filename = temporaryFile();
    let database = track(openDatabase(filename));
    close(database);
    database = track(new DatabaseSync(filename));
    database.exec("DROP TABLE request_history; DROP TABLE saved_requests; DROP TABLE collections; CREATE TABLE saved_requests (id INTEGER PRIMARY KEY, legacy_value TEXT); INSERT INTO saved_requests VALUES (1, 'keep me'); PRAGMA user_version = 0;");
    close(database);
    expect(() => openDatabase(filename)).toThrow(/already exists/);
    database = track(new DatabaseSync(filename));
    expect(database.prepare('PRAGMA user_version').get().user_version).toBe(0);
    expect(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map((row) => row.name)).toEqual(['saved_requests']);
    expect(database.prepare('SELECT legacy_value FROM saved_requests').get().legacy_value).toBe('keep me');
    database.exec('BEGIN IMMEDIATE; COMMIT;');
  });

  it('refuses a newer schema version without resetting it or deleting its data', () => {
    const filename = temporaryFile();
    let database = track(openDatabase(filename));
    database.prepare('INSERT INTO collections (name) VALUES (?)').run('Future workspace');
    database.exec('PRAGMA user_version = 4;');
    close(database);
    expect(() => openDatabase(filename)).toThrow(/schema version 4/);
    database = track(new DatabaseSync(filename));
    expect(database.prepare('PRAGMA user_version').get().user_version).toBe(4);
    expect(database.prepare('SELECT name FROM collections').get().name).toBe('Future workspace');
    database.exec('BEGIN IMMEDIATE; COMMIT;');
  });

  it('rejects a corrupt file without replacing it', () => {
    const filename = temporaryFile();
    const database = track(openDatabase(filename));
    close(database);
    writeFileSync(filename, 'not a sqlite database');
    expect(() => openDatabase(filename)).toThrow();
    expect(readFileSync(filename, 'utf8')).toBe('not a sqlite database');
  });

  it('upgrades a real version 1 workspace without losing collections', () => {
    const filename = temporaryFile();
    let database = legacyDatabase(filename);
    database.prepare('INSERT INTO collections (id, name) VALUES (?, ?)').run(7, 'Keep my collection');
    close(database);
    database = track(openDatabase(filename));
    expect(database.prepare('PRAGMA user_version').get().user_version).toBe(3);
    expect(database.prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);
    expect(database.prepare('SELECT id, name FROM collections').get()).toMatchObject({ id: 7, name: 'Keep my collection' });
    expect(database.prepare('SELECT count(*) AS total FROM request_history').get().total).toBe(0);
    expect(database.prepare('PRAGMA table_info(saved_requests)').all().map((row) => row.name)).toEqual(['id', 'collection_id', 'name', 'method', 'request_encrypted', 'created_at', 'updated_at']);
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('preserves manually seeded version 1 requests and linked history if automatic upgrade cannot convert them', () => {
    const filename = temporaryFile();
    let database = legacyDatabase(filename);
    database.prepare('INSERT INTO collections (id, name) VALUES (?, ?)').run(7, 'Keep my collection');
    database.prepare('INSERT INTO saved_requests (id, collection_id, name, method, url) VALUES (?, ?, ?, ?, ?)')
      .run(8, 7, 'Manual seed', 'GET', 'http://localhost/keep');
    addLegacyHistory(database, 8);
    close(database);
    expect(() => openDatabase(filename)).toThrow(/manually inserted requests/);
    database = track(new DatabaseSync(filename));
    expect(database.prepare('PRAGMA user_version').get().user_version).toBe(1);
    expect(database.prepare('SELECT url FROM saved_requests').get().url).toBe('http://localhost/keep');
    expect(database.prepare('SELECT saved_request_id FROM request_history').get().saved_request_id).toBe(8);
    expect(database.prepare("SELECT name FROM sqlite_schema WHERE name = 'saved_requests_next'").get()).toBeUndefined();
    database.exec('BEGIN IMMEDIATE; COMMIT;');
  });

  it('upgrades version 2 while keeping encrypted saved requests byte-for-byte', () => {
    const filename = temporaryFile();
    let database = legacyDatabase(filename);
    database.exec(readFileSync(new URL('../electron/migrations/002-protected-requests.sql', import.meta.url), 'utf8'));
    database.exec('PRAGMA user_version = 2;');
    const { requestId } = addRequest(database);
    const before = database.prepare('SELECT * FROM saved_requests').get();
    close(database);
    database = track(openDatabase(filename));
    expect(database.prepare('PRAGMA user_version').get().user_version).toBe(3);
    expect(database.prepare('SELECT * FROM saved_requests WHERE id = ?').get(requestId)).toEqual(before);
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('refuses to drop unexpected manually seeded older history during upgrade', () => {
    const filename = temporaryFile();
    let database = legacyDatabase(filename);
    database.exec(readFileSync(new URL('../electron/migrations/002-protected-requests.sql', import.meta.url), 'utf8'));
    database.exec('PRAGMA user_version = 2;');
    const { requestId } = addRequest(database);
    addLegacyHistory(database, requestId);
    close(database);
    expect(() => openDatabase(filename)).toThrow(/manually inserted history/);
    database = track(new DatabaseSync(filename));
    expect(database.prepare('PRAGMA user_version').get().user_version).toBe(2);
    expect(database.prepare('SELECT response_snapshot_json FROM request_history').get().response_snapshot_json).toBe(responseSnapshot);
    expect(database.prepare('SELECT count(*) AS total FROM saved_requests').get().total).toBe(1);
    database.exec('BEGIN IMMEDIATE; COMMIT;');
  });
});
