'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const confMgmt = require('./conf-mgmt');

let _db = null;

/**
 * Returns the singleton SQLite connection, creating the database file and
 * running migrations on first access.
 *
 * WAL journal mode is used for improved read concurrency. The database file
 * is stored alongside the other app-data JSON files managed by confMgmt.
 */
function getDb() {
  if (_db) {
    return _db;
  }

  const dbPath = path.join(confMgmt.getNexlAppDataDir(), 'nexl-data.db');

  _db = new Database(dbPath);

  // WAL gives better concurrent read performance; foreign keys for integrity
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  migrate(_db);

  return _db;
}

/**
 * Applies all DDL migrations in a single transaction. Safe to call on every
 * startup — all statements use IF NOT EXISTS.
 */
function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_revisions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path    TEXT    NOT NULL,
      revision_no  INTEGER NOT NULL,
      saved_at     INTEGER NOT NULL,
      saved_by     TEXT    NOT NULL,
      label        TEXT,
      content      TEXT    NOT NULL,
      content_hash TEXT    NOT NULL,
      size_bytes   INTEGER NOT NULL,
      is_deleted   INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_rev_path
      ON file_revisions(file_path, revision_no DESC);

    CREATE INDEX IF NOT EXISTS idx_rev_saved_at
      ON file_revisions(saved_at DESC);

    CREATE TABLE IF NOT EXISTS file_metadata (
      file_path        TEXT    PRIMARY KEY,
      first_saved_at   INTEGER NOT NULL,
      last_saved_at    INTEGER NOT NULL,
      last_saved_by    TEXT    NOT NULL,
      revision_count   INTEGER NOT NULL DEFAULT 0,
      current_hash     TEXT    NOT NULL
    );
  `);
}

module.exports = { getDb };
