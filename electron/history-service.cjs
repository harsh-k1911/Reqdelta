const { copyRequest } = require('./request-config.cjs');

const MAX_ENTRIES = 100;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
const PAGE_SIZE = 20;
const FIELDS = `h.id, h.saved_request_id AS savedRequestId, s.name AS requestName,
  h.method, h.status_code AS statusCode, h.error_code AS errorCode,
  h.duration_ms AS durationMs, h.executed_at AS executedAt`;
const FROM_HISTORY = 'FROM request_history h LEFT JOIN saved_requests s ON s.id = h.saved_request_id';
const failure = (code, message) => ({ ok: false, error: { code, message } });
const validId = (id) => Number.isSafeInteger(id) && id > 0;
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

function checkOutcome(outcome) {
  if (!isObject(outcome) || typeof outcome.ok !== 'boolean') throw new Error('Invalid outcome.');
  if (!outcome.ok) {
    if (!isObject(outcome.error) || !/^[A-Z_]{1,80}$/.test(outcome.error.code) || typeof outcome.error.message !== 'string') throw new Error('Invalid failure.');
    return;
  }
  const response = outcome.response;
  if (!isObject(response) || !Number.isInteger(response.status) || response.status < 100 || response.status > 999
    || typeof response.statusText !== 'string' || typeof response.url !== 'string' || typeof response.body !== 'string'
    || !['json', 'text'].includes(response.format) || !Number.isSafeInteger(response.sizeBytes) || response.sizeBytes < 0
    || !Number.isSafeInteger(response.durationMs) || response.durationMs < 0 || !Array.isArray(response.headers)
    || response.headers.some((header) => !isObject(header) || typeof header.name !== 'string' || typeof header.value !== 'string')) {
    throw new Error('Invalid response.');
  }
  if (response.format === 'json') JSON.parse(response.body);
}

function createHistoryService(database, secureStorage, limits = {}) {
  const maxEntries = limits.maxEntries ?? MAX_ENTRIES;
  const maxBytes = limits.maxBytes ?? MAX_BYTES;
  if (!validId(maxEntries) || !validId(maxBytes)) throw new Error('History retention limits must be positive integers.');

  return {
    // Main-process use only. The preload exposes no history-write operation.
    async append({ request, outcome, savedRequestId = null, durationMs, executedAt }) {
      try {
        const configuration = copyRequest(request);
        checkOutcome(outcome);
        if (!Number.isSafeInteger(durationMs) || durationMs < 0 || !Number.isFinite(Date.parse(executedAt))) throw new Error('Invalid execution metadata.');
        const snapshot = { version: 1, request: configuration, outcome };
        if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_SNAPSHOT_BYTES) return failure('HISTORY_TOO_LARGE', 'This execution is too large to keep in history.');
        const encrypted = await secureStorage.protect(snapshot);
        if (encrypted.byteLength > maxBytes) return failure('HISTORY_TOO_LARGE', 'This execution exceeds the history storage budget.');

        // No fetch or encryption awaits inside the database transaction.
        database.exec('BEGIN IMMEDIATE;');
        try {
          const linkedId = validId(savedRequestId) && database.prepare('SELECT id FROM saved_requests WHERE id = ?').get(savedRequestId) ? savedRequestId : null;
          const row = database.prepare(`INSERT INTO request_history
            (saved_request_id, method, status_code, error_code, duration_ms, executed_at, snapshot_encrypted)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`)
            .get(linkedId, configuration.method, outcome.ok ? outcome.response.status : null, outcome.ok ? null : outcome.error.code, durationMs, executedAt, encrypted);
          const entries = database.prepare('SELECT id, length(snapshot_encrypted) AS bytes FROM request_history ORDER BY id DESC').all();
          let bytes = 0;
          for (const [index, entry] of entries.entries()) {
            bytes += entry.bytes;
            if (index >= maxEntries || bytes > maxBytes) {
              database.prepare('DELETE FROM request_history WHERE id <= ?').run(entry.id);
              break;
            }
          }
          database.exec('COMMIT;');
          return { ok: true, id: row.id };
        } catch (error) {
          database.exec('ROLLBACK;');
          throw error;
        }
      } catch (error) {
        if (error.code === 'SECURE_STORAGE_UNAVAILABLE') return failure(error.code, error.message);
        return failure('HISTORY_WRITE_FAILED', 'This execution could not be saved to history.');
      }
    },

    list(input = {}) {
      if (!isObject(input) || (input.beforeId !== undefined && input.beforeId !== null && !validId(input.beforeId))) return failure('INVALID_CURSOR', 'Choose a valid history page.');
      try {
        const rows = input.beforeId
          ? database.prepare(`SELECT ${FIELDS} ${FROM_HISTORY} WHERE h.id < ? ORDER BY h.id DESC LIMIT ?`).all(input.beforeId, PAGE_SIZE + 1)
          : database.prepare(`SELECT ${FIELDS} ${FROM_HISTORY} ORDER BY h.id DESC LIMIT ?`).all(PAGE_SIZE + 1);
        const entries = rows.slice(0, PAGE_SIZE);
        return { ok: true, entries, nextBeforeId: rows.length > PAGE_SIZE ? entries.at(-1).id : null };
      } catch {
        return failure('STORAGE_ERROR', 'Could not load history. Try again.');
      }
    },

    async get(input) {
      if (!isObject(input) || !validId(input.id)) return failure('INVALID_ID', 'Choose a valid history entry.');
      let row;
      try {
        row = database.prepare(`SELECT ${FIELDS}, h.snapshot_encrypted ${FROM_HISTORY} WHERE h.id = ?`).get(input.id);
      } catch {
        return failure('STORAGE_ERROR', 'Could not read this history entry. Try again.');
      }
      if (!row) return failure('NOT_FOUND', 'This history entry is no longer available. Older entries are removed as the history limit is reached.');
      try {
        const { value, replacement } = await secureStorage.unprotect(row.snapshot_encrypted);
        if (value?.version !== 1) throw new Error('Unknown history format.');
        const request = copyRequest(value.request);
        checkOutcome(value.outcome);
        if (request.method !== row.method || (value.outcome.ok ? value.outcome.response.status !== row.statusCode || row.errorCode !== null : value.outcome.error.code !== row.errorCode || row.statusCode !== null)) throw new Error('History metadata mismatch.');
        if (replacement) database.prepare('UPDATE request_history SET snapshot_encrypted = ? WHERE id = ?').run(replacement, row.id);
        const { snapshot_encrypted: _encrypted, ...metadata } = row;
        return { ok: true, entry: { ...metadata, request, outcome: value.outcome } };
      } catch (error) {
        if (error.code === 'SECURE_STORAGE_UNAVAILABLE') return failure(error.code, error.message);
        return failure('UNREADABLE_HISTORY', 'Could not unlock this snapshot on this Mac. The stored entry has been kept.');
      }
    },
  };
}

module.exports = { createHistoryService };
