const COLLECTION_FIELDS = 'id, name, created_at AS createdAt, updated_at AS updatedAt';

function listCollections(database) {
  try {
    const collections = database.prepare(`SELECT ${COLLECTION_FIELDS} FROM collections ORDER BY id DESC`).all();
    return { ok: true, collections };
  } catch {
    return { ok: false, error: { code: 'STORAGE_ERROR', message: 'Could not load collections. Try again.' } };
  }
}

function createCollection(database, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.name !== 'string') {
    return { ok: false, error: { code: 'INVALID_COLLECTION', message: 'Enter a collection name.' } };
  }
  const name = input.name.trim();
  if (!name || Array.from(name).length > 100) {
    return { ok: false, error: { code: 'INVALID_COLLECTION', message: 'Use a name with 1–100 characters.' } };
  }
  if (name.includes('\0')) {
    return { ok: false, error: { code: 'INVALID_COLLECTION', message: 'The collection name contains an unsupported character.' } };
  }
  try {
    // Values are bound separately from SQL, including quotes in a user's name.
    const collection = database.prepare(`INSERT INTO collections (name) VALUES (?) RETURNING ${COLLECTION_FIELDS}`).get(name);
    return { ok: true, collection };
  } catch {
    return { ok: false, error: { code: 'STORAGE_ERROR', message: 'Could not create the collection. Try again.' } };
  }
}

module.exports = { listCollections, createCollection };
