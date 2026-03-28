# Persistence & Versioning Plan

## Objective

Add a **SQLite database** as a second storage layer alongside the existing file system. Introduce a **file versioning system** (revision history) so that every save of a configuration file creates an immutable revision that can be browsed, diffed, and restored.

---

## Design Principles

- The existing file-based storage **continues to work as before** — the file system remains the live working copy
- The database is **additive**, not a replacement; it stores metadata and revision snapshots
- No existing API contracts change; new API endpoints are added
- The migration to the database must be **opt-in and backward compatible** — if the DB file is missing, the server starts normally without versioning features
- Prefer **SQLite** (via `better-sqlite3`) for zero-infrastructure deployment; it fits the existing single-server model

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Angular Frontend                        │
│                                                             │
│  FileEditor ──save──► POST /nexl/storage/save-file-to-storage
│                                                             │
│  NEW: VersionHistoryPanel ◄──► GET /nexl/storage/revisions │
│  NEW: RestoreRevisionBtn  ──►  POST /nexl/storage/restore   │
└────────────────────────────────┬────────────────────────────┘
                                 │ HTTP
┌────────────────────────────────▼────────────────────────────┐
│                     Express Backend                         │
│                                                             │
│  storage-route.js                                           │
│    save-file-to-storage ──► writes file ──► creates revision│
│                                                             │
│  NEW: versioning-route.js                                   │
│    GET  /nexl/storage/revisions     ← list revisions        │
│    GET  /nexl/storage/revision      ← get one revision      │
│    POST /nexl/storage/restore       ← restore revision      │
│    DELETE /nexl/storage/revision    ← delete revision       │
│                                                             │
│  NEW: api/versioning.js             ← versioning business   │
│  NEW: api/db.js                     ← DB connection/setup   │
│                                                             │
└────────────────────────────────┬────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────┐
│              SQLite Database (nexl-data.db)                  │
│                                                             │
│  TABLE file_revisions                                       │
│  TABLE file_metadata                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### `file_revisions`

Stores every saved snapshot of a configuration file.

```sql
CREATE TABLE IF NOT EXISTS file_revisions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path    TEXT    NOT NULL,           -- relative path from storage root
  revision_no  INTEGER NOT NULL,           -- monotonic counter per file (1, 2, 3…)
  saved_at     INTEGER NOT NULL,           -- Unix timestamp (ms)
  saved_by     TEXT    NOT NULL,           -- username
  label        TEXT,                       -- optional user-supplied label
  content      TEXT    NOT NULL,           -- full file content (UTF-8)
  content_hash TEXT    NOT NULL,           -- SHA-256 of content (for dedup)
  size_bytes   INTEGER NOT NULL,           -- length in bytes
  is_deleted   INTEGER NOT NULL DEFAULT 0  -- soft-delete flag
);

CREATE INDEX idx_rev_path ON file_revisions(file_path, revision_no DESC);
CREATE INDEX idx_rev_saved_at ON file_revisions(saved_at DESC);
```

### `file_metadata`

Tracks per-file metadata across all revisions.

```sql
CREATE TABLE IF NOT EXISTS file_metadata (
  file_path        TEXT    PRIMARY KEY,
  first_saved_at   INTEGER NOT NULL,
  last_saved_at    INTEGER NOT NULL,
  last_saved_by    TEXT    NOT NULL,
  revision_count   INTEGER NOT NULL DEFAULT 0,
  current_hash     TEXT    NOT NULL
);
```

---

## Backend Implementation

### Step 1 — Install `better-sqlite3`

```bash
npm install better-sqlite3
```

`better-sqlite3` is synchronous, has zero native build complexity on Node 6+, and is ideal for single-server deployments. No connection pooling needed.

### Step 2 — `api/db.js`

```javascript
'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const confMgmt = require('./conf-mgmt');

let _db = null;

function getDb() {
  if (_db) return _db;

  const dataDir = confMgmt.getDataDir();
  const dbPath = path.join(dataDir, 'nexl-data.db');

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');   // better concurrency
  _db.pragma('foreign_keys = ON');

  // Run migrations on startup
  migrate(_db);

  return _db;
}

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
    CREATE INDEX IF NOT EXISTS idx_rev_path ON file_revisions(file_path, revision_no DESC);
    CREATE INDEX IF NOT EXISTS idx_rev_saved_at ON file_revisions(saved_at DESC);

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
```

### Step 3 — `api/versioning.js`

```javascript
'use strict';

const crypto = require('crypto');
const { getDb } = require('./db');

function saveRevision({ filePath, content, savedBy, label }) {
  const db = getDb();
  const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  const now = Date.now();
  const sizeBytes = Buffer.byteLength(content, 'utf8');

  // Get next revision number
  const lastRev = db.prepare(
    'SELECT revision_no FROM file_revisions WHERE file_path = ? ORDER BY revision_no DESC LIMIT 1'
  ).get(filePath);
  const revNo = lastRev ? lastRev.revision_no + 1 : 1;

  // Skip if content unchanged
  const meta = db.prepare('SELECT current_hash FROM file_metadata WHERE file_path = ?').get(filePath);
  if (meta && meta.current_hash === hash) return null;

  // Insert revision
  db.prepare(`
    INSERT INTO file_revisions (file_path, revision_no, saved_at, saved_by, label, content, content_hash, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(filePath, revNo, now, savedBy, label || null, content, hash, sizeBytes);

  // Upsert metadata
  db.prepare(`
    INSERT INTO file_metadata (file_path, first_saved_at, last_saved_at, last_saved_by, revision_count, current_hash)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      last_saved_at = excluded.last_saved_at,
      last_saved_by = excluded.last_saved_by,
      revision_count = revision_count + 1,
      current_hash = excluded.current_hash
  `).run(filePath, now, now, savedBy, hash);

  return revNo;
}

function listRevisions(filePath, limit = 50, offset = 0) {
  return getDb().prepare(`
    SELECT id, file_path, revision_no, saved_at, saved_by, label, content_hash, size_bytes
    FROM file_revisions
    WHERE file_path = ? AND is_deleted = 0
    ORDER BY revision_no DESC
    LIMIT ? OFFSET ?
  `).all(filePath, limit, offset);
}

function getRevision(filePath, revisionNo) {
  return getDb().prepare(`
    SELECT * FROM file_revisions
    WHERE file_path = ? AND revision_no = ? AND is_deleted = 0
  `).get(filePath, revisionNo);
}

function deleteRevision(filePath, revisionNo) {
  getDb().prepare(`
    UPDATE file_revisions SET is_deleted = 1
    WHERE file_path = ? AND revision_no = ?
  `).run(filePath, revisionNo);
}

module.exports = { saveRevision, listRevisions, getRevision, deleteRevision };
```

### Step 4 — Hook into `storage-route.js`

In `save-file-to-storage` endpoint, after the file is written successfully:

```javascript
const versioning = require('../api/versioning');

// Existing save logic...
storageUtils.saveFileToStorage(relativePath, content)
  .then(() => {
    // NEW: record revision
    const username = security.getLoggedInUsername(req) || 'anonymous';
    try {
      versioning.saveRevision({
        filePath: relativePath,
        content: content,
        savedBy: username,
        label: req.body.label || null
      });
    } catch (e) {
      // versioning failure must NOT break the save
      logger.error('Failed to save revision: ' + e.message);
    }
    res.json({});
  })
  .catch(err => next(err));
```

> **Critical**: Wrap `versioning.saveRevision()` in try/catch. If the DB write fails, the file has already been saved — do not roll back the file save. Versioning is best-effort.

### Step 5 — `routes/versioning-route.js` (New File)

```javascript
'use strict';

const express = require('express');
const router = express.Router();
const security = require('../api/security');
const versioning = require('../api/versioning');

// List revisions for a file
router.post('/list', (req, res, next) => {
  if (!security.isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  const { filePath, limit, offset } = req.body;
  if (!filePath) return res.status(400).json({ error: 'filePath required' });
  try {
    const revisions = versioning.listRevisions(filePath, limit || 50, offset || 0);
    res.json({ revisions });
  } catch (e) { next(e); }
});

// Get full content of one revision
router.post('/get', (req, res, next) => {
  if (!security.isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  const { filePath, revisionNo } = req.body;
  const rev = versioning.getRevision(filePath, parseInt(revisionNo));
  if (!rev) return res.status(404).json({ error: 'Revision not found' });
  res.json({ revision: rev });
});

// Restore a revision (re-saves file + creates new revision)
router.post('/restore', (req, res, next) => {
  if (!security.isLoggedIn(req)) return res.status(401).json({ error: 'Unauthorized' });
  const { filePath, revisionNo } = req.body;
  const rev = versioning.getRevision(filePath, parseInt(revisionNo));
  if (!rev) return res.status(404).json({ error: 'Revision not found' });
  const storageUtils = require('../api/storage-utils');
  const username = security.getLoggedInUsername(req) || 'anonymous';
  storageUtils.saveFileToStorage(filePath, rev.content)
    .then(() => {
      versioning.saveRevision({
        filePath, content: rev.content, savedBy: username,
        label: `Restored from revision ${revisionNo}`
      });
      res.json({});
    })
    .catch(next);
});

// Soft-delete a revision (admin only)
router.post('/delete', (req, res, next) => {
  if (!security.isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  const { filePath, revisionNo } = req.body;
  versioning.deleteRevision(filePath, parseInt(revisionNo));
  res.json({});
});

module.exports = router;
```

### Step 6 — Register Route in `nexl-app.js`

```javascript
const versioningRoute = require('../routes/versioning-route');
app.use('/nexl/versioning/', versioningRoute);
```

---

## New API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/nexl/versioning/list` | User | List revisions for a file path |
| POST | `/nexl/versioning/get` | User | Get full content of a specific revision |
| POST | `/nexl/versioning/restore` | User | Restore file to a previous revision |
| POST | `/nexl/versioning/delete` | Admin | Soft-delete a revision |

Request bodies follow existing project conventions (JSON body with named fields).

---

## Frontend Implementation

### New Component: `VersionHistoryPanelComponent`

**Path**: `frontend/src/app/main/filemanager/storage-files-editor/version-history/`

**Features**:
- Opens as a jqxWindow dialog (consistent with existing dialogs)
- Triggered from editor toolbar: "History" button per tab
- Lists revisions in a jqxGrid: columns = Revision #, Date/Time, Saved By, Label, Size
- Click row → preview content in a read-only ACE editor panel
- "Restore" button on selected revision
- "Compare with current" button → feeds into existing `DiffsWindow`

**Data flow**:
```
VersionHistoryPanelComponent
  → POST /nexl/versioning/list  { filePath }
  ← { revisions: [...] }
  
  [on row click]
  → POST /nexl/versioning/get   { filePath, revisionNo }
  ← { revision: { content, ... } }
  
  [on Restore click]
  → POST /nexl/versioning/restore { filePath, revisionNo }
  → MessageService.sendMessage(MESSAGE_TYPE.RELOAD_FILE)
```

### Changes to Existing Components

**`StorageFilesEditorComponent`**:
- Add "History" icon button to each tab header (or toolbar)
- On click: `messageService.sendMessage(MESSAGE_TYPE.OPEN_VERSION_HISTORY, { filePath })`

**`MessageService`**: Add message type `OPEN_VERSION_HISTORY`

**`LocalStorageService`**: No changes needed

---

## Migration Plan: Backfilling Existing Files

For teams with existing files, provide a one-time backfill script:

**File**: `backend/scripts/backfill-revisions.js`

```javascript
// Run once with: node backend/scripts/backfill-revisions.js
// Reads all current .js files from storage and inserts revision_no=1
```

This is non-destructive: files already in the DB are skipped.

---

## Retention Policy

To prevent unbounded DB growth, add a configurable retention setting in `settings.json`:

```json
{
  "versioning": {
    "enabled": true,
    "maxRevisionsPerFile": 100,
    "retentionDays": 365
  }
}
```

Add a scheduled job (using existing `cron` infrastructure) to purge old revisions.

---

## Phase Sequencing

| Phase | What | Prerequisite |
|---|---|---|
| V1 | `db.js` + `versioning.js` + hook into save | None |
| V2 | `versioning-route.js` + register in app | V1 |
| V3 | `VersionHistoryPanelComponent` (list + preview) | V2 |
| V4 | Restore functionality (backend + frontend) | V3 |
| V5 | Retention policy + scheduled cleanup | V1 |
| V6 | Backfill script | V1 |
| V7 | Revision label input in save dialog | V3 |

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| DB write failure breaks file save | ❌ Eliminated | try/catch in hook — versioning never throws to caller |
| DB file not found on startup | 🟡 Medium | `migrate()` creates it automatically on first start |
| Large files bloat DB | 🟡 Medium | Retention policy + `maxRevisionsPerFile` setting |
| Deduplication savings | 🟢 Positive | `content_hash` check skips identical saves |
| SQLite concurrency | 🟡 Low risk | WAL mode + single-server deployment; no multi-process writes |
| `better-sqlite3` native build | 🟢 Low | Pre-built binaries available for Node 6+; no Python required |

---

## Files to Create (New)

| File | Purpose |
|---|---|
| `backend/api/db.js` | SQLite connection + schema migration |
| `backend/api/versioning.js` | Revision CRUD business logic |
| `backend/routes/versioning-route.js` | New REST endpoints |
| `backend/scripts/backfill-revisions.js` | One-time backfill of existing files |
| `frontend/src/app/main/filemanager/storage-files-editor/version-history/version-history.component.ts` | Version history panel |
| `frontend/src/app/main/filemanager/storage-files-editor/version-history/version-history.component.html` | Template |
| `frontend/src/app/main/filemanager/storage-files-editor/version-history/version-history.component.css` | Styles |

## Files to Modify (Key)

| File | Change |
|---|---|
| `backend/nexl-app/nexl-app.js` | Register versioning route |
| `backend/routes/storage-route.js` | Hook `saveRevision()` after successful file save |
| `backend/common/rest-urls.js` | Add versioning endpoint constants |
| `frontend/src/app/main/services/message.service.ts` | Add `OPEN_VERSION_HISTORY` message type |
| `frontend/src/app/main/filemanager/storage-files-editor/storage-files-editor.component.ts` | Add history button per tab |
| `frontend/src/app/main/main.module.ts` | Declare `VersionHistoryPanelComponent` |
| `package.json` (root) | Add `better-sqlite3` dependency |
