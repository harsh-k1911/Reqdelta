const { mkdtempSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../electron/database.cjs');

// This exercise uses a fresh temporary file, separate from your app workspace.
const folder = mkdtempSync(path.join(os.tmpdir(), 'reqdelta-db-demo-'));
const filename = path.join(folder, 'demo.sqlite');
let database;

try {
  database = openDatabase(filename);
  const collection = database.prepare('INSERT INTO collections (name) VALUES (?)').run('Student API');
  // An opaque placeholder demonstrates a BLOB; only Electron performs real encryption.
  const saved = database.prepare('INSERT INTO saved_requests (collection_id, name, method, request_encrypted) VALUES (?, ?, ?, ?)')
    .run(collection.lastInsertRowid, 'Get student', 'GET', Buffer.from('made-up encrypted payload placeholder'));

  database.prepare('INSERT INTO request_history (saved_request_id, method, status_code, snapshot_encrypted, duration_ms) VALUES (?, ?, ?, ?, ?)')
    .run(saved.lastInsertRowid, 'GET', 200, Buffer.from('made-up execution snapshot placeholder'), 12);

  database.close();
  database = null;
  console.log('Closed the database. Reopening the same file...');
  database = openDatabase(filename);

  const row = database.prepare(`
    SELECT collections.name AS collection_name, saved_requests.name AS request_name,
      request_history.status_code AS response_status
    FROM request_history
    JOIN saved_requests ON saved_requests.id = request_history.saved_request_id
    JOIN collections ON collections.id = saved_requests.collection_id
  `).get();
  console.log(`Read back: ${row.collection_name} → ${row.request_name} → HTTP ${row.response_status}`);
  console.log(`Database file for inspection: ${filename}`);
  console.log('This contains made-up example data; no HTTP request was made.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  database?.close();
}
