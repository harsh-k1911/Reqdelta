const { RequestError } = require('./request-service.cjs');
const { copyRequest } = require('./request-config.cjs');

const FIELDS = 'id, collection_id AS collectionId, name, method, created_at AS createdAt, updated_at AS updatedAt';
const failure = (code, message) => ({ ok: false, error: { code, message } });
const validId = (id) => Number.isSafeInteger(id) && id > 0;
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

function createSavedRequestsService(database, secureStorage) {
  return {
    list(input) {
      if (!isObject(input) || !validId(input.collectionId)) return failure('INVALID_COLLECTION', 'Choose a valid collection.');
      try {
        if (!database.prepare('SELECT id FROM collections WHERE id = ?').get(input.collectionId)) return failure('NOT_FOUND', 'This collection no longer exists.');
        const savedRequests = database.prepare(`SELECT ${FIELDS} FROM saved_requests WHERE collection_id = ? ORDER BY id DESC`).all(input.collectionId);
        return { ok: true, savedRequests };
      } catch {
        return failure('STORAGE_ERROR', 'Could not load saved requests. Try again.');
      }
    },

    async create(input) {
      if (!isObject(input) || !validId(input.collectionId)) return failure('INVALID_COLLECTION', 'Choose a valid collection.');
      if (typeof input.name !== 'string' || !input.name.trim() || Array.from(input.name.trim()).length > 100 || input.name.includes('\0')) {
        return failure('INVALID_NAME', 'Use a request name with 1–100 characters and no null characters.');
      }
      try {
        const request = copyRequest(input.request);
        if (!database.prepare('SELECT id FROM collections WHERE id = ?').get(input.collectionId)) return failure('NOT_FOUND', 'This collection no longer exists.');
        const encrypted = await secureStorage.protect({ version: 1, request });
        const savedRequest = database.prepare(`INSERT INTO saved_requests (collection_id, name, method, request_encrypted) VALUES (?, ?, ?, ?) RETURNING ${FIELDS}`)
          .get(input.collectionId, input.name.trim(), request.method, encrypted);
        return { ok: true, savedRequest };
      } catch (error) {
        if (error instanceof RequestError || error.code === 'SECURE_STORAGE_UNAVAILABLE') return failure(error.code, error.message);
        return failure('STORAGE_ERROR', 'Could not save the request. Your draft is still available.');
      }
    },

    async get(input) {
      if (!isObject(input) || !validId(input.id)) return failure('INVALID_ID', 'Choose a valid saved request.');
      let row;
      try {
        row = database.prepare(`SELECT ${FIELDS}, request_encrypted FROM saved_requests WHERE id = ?`).get(input.id);
      } catch {
        return failure('STORAGE_ERROR', 'Could not read the saved request. Try again.');
      }
      if (!row) return failure('NOT_FOUND', 'This saved request no longer exists.');
      try {
        const { value, replacement } = await secureStorage.unprotect(row.request_encrypted);
        if (value?.version !== 1) throw new Error('Unknown request format.');
        const request = copyRequest(value.request);
        if (request.method !== row.method) throw new Error('Request metadata mismatch.');
        if (replacement) database.prepare('UPDATE saved_requests SET request_encrypted = ? WHERE id = ?').run(replacement, row.id);
        const { request_encrypted: _encrypted, ...savedRequest } = row;
        return { ok: true, savedRequest: { ...savedRequest, request } };
      } catch (error) {
        if (error.code === 'SECURE_STORAGE_UNAVAILABLE') return failure(error.code, error.message);
        return failure('UNREADABLE_REQUEST', 'Could not unlock this saved request on this Mac. The stored record has been kept.');
      }
    },
  };
}

module.exports = { createSavedRequestsService };
