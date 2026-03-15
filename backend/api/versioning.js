'use strict';

const crypto = require('crypto');
const { getDb } = require('./db');

/**
 * Records a new revision for a file. If the file content is identical to
 * the last saved revision (same SHA-256 hash) the call is a no-op and
 * returns null. On success, returns the new revision number.
 *
 * This function must never throw to the caller — callers should wrap it
 * in try/catch so a DB failure never prevents a file from being saved.
 */
function saveRevision({ filePath, content, savedBy, label }) {
  const db = getDb();
  const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  const now = Date.now();
  const sizeBytes = Buffer.byteLength(content, 'utf8');

  // Skip if content is identical to the current stored version
  const meta = db.prepare(
    'SELECT current_hash FROM file_metadata WHERE file_path = ?'
  ).get(filePath);
  if (meta && meta.current_hash === hash) {
    return null;
  }

  // Determine next revision number for this file
  const lastRev = db.prepare(
    'SELECT revision_no FROM file_revisions WHERE file_path = ? ORDER BY revision_no DESC LIMIT 1'
  ).get(filePath);
  const revisionNo = lastRev ? lastRev.revision_no + 1 : 1;

  // Insert the revision snapshot
  db.prepare(`
    INSERT INTO file_revisions
      (file_path, revision_no, saved_at, saved_by, label, content, content_hash, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(filePath, revisionNo, now, savedBy, label || null, content, hash, sizeBytes);

  // Upsert file metadata
  db.prepare(`
    INSERT INTO file_metadata (file_path, first_saved_at, last_saved_at, last_saved_by, revision_count, current_hash)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      last_saved_at   = excluded.last_saved_at,
      last_saved_by   = excluded.last_saved_by,
      revision_count  = revision_count + 1,
      current_hash    = excluded.current_hash
  `).run(filePath, now, now, savedBy, hash);

  return revisionNo;
}

/**
 * Returns a page of revisions for the given file path, newest first.
 * Content is NOT included — use getRevision() to fetch full content.
 */
function listRevisions(filePath, limit, offset) {
  limit = limit || 50;
  offset = offset || 0;
  return getDb().prepare(`
    SELECT id, file_path, revision_no, saved_at, saved_by, label, content_hash, size_bytes
    FROM file_revisions
    WHERE file_path = ? AND is_deleted = 0
    ORDER BY revision_no DESC
    LIMIT ? OFFSET ?
  `).all(filePath, limit, offset);
}

/**
 * Returns a single revision including its full file content,
 * or undefined if not found / soft-deleted.
 */
function getRevision(filePath, revisionNo) {
  return getDb().prepare(`
    SELECT id, file_path, revision_no, saved_at, saved_by, label,
           content, content_hash, size_bytes
    FROM file_revisions
    WHERE file_path = ? AND revision_no = ? AND is_deleted = 0
  `).get(filePath, revisionNo);
}

/**
 * Soft-deletes a revision so it no longer appears in listings.
 */
function deleteRevision(filePath, revisionNo) {
  getDb().prepare(`
    UPDATE file_revisions SET is_deleted = 1
    WHERE file_path = ? AND revision_no = ?
  `).run(filePath, revisionNo);
}

module.exports = { saveRevision, listRevisions, getRevision, deleteRevision };
