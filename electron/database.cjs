const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 3;

function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename);
  try {
    database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

    // Lock before reading the version so simultaneous startups cannot migrate twice.
    database.exec('BEGIN IMMEDIATE;');
    try {
      const { user_version: version } = database.prepare('PRAGMA user_version').get();
      if (version < 0 || version > SCHEMA_VERSION) {
        throw new Error(`Unsupported database schema version ${version}. Open this workspace with a compatible ReqDelta version.`);
      }
      if (version === 0) {
        const schema = readFileSync(path.join(__dirname, 'migrations', '001-initial.sql'), 'utf8');
        database.exec(schema);
        database.exec('PRAGMA user_version = 1;');
      }
      if (version < 2) {
        // Real request saving starts at v2. Preserve unexpected manually seeded
        // v1 requests instead of dropping records we cannot safely convert here.
        if (database.prepare('SELECT count(*) AS total FROM saved_requests').get().total > 0) {
          throw new Error('This version 1 database contains manually inserted requests. Its data was preserved; migrate those records before upgrading.');
        }
        database.exec(readFileSync(path.join(__dirname, 'migrations', '002-protected-requests.sql'), 'utf8'));
        database.exec('PRAGMA user_version = 2;');
      }
      if (version < 3) {
        if (database.prepare('SELECT count(*) AS total FROM request_history').get().total > 0) {
          throw new Error('This older database contains manually inserted history. Its data was preserved; migrate those records before upgrading.');
        }
        database.exec(readFileSync(path.join(__dirname, 'migrations', '003-protected-history.sql'), 'utf8'));
        database.exec('PRAGMA user_version = 3;');
      }
      database.exec('COMMIT;');
    } catch (error) {
      database.exec('ROLLBACK;');
      throw error;
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

module.exports = { openDatabase };
