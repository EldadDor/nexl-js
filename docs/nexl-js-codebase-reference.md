# nexl-js Codebase Reference

> Provide this file to a new AI session to get up to speed on this project quickly.
> Project root: `C:\workspaces\nexl-js`

---

## Project Overview

**nexl** is a self-hosted server that evaluates a custom JavaScript-based expression language (`nexl-engine`) to produce JSON/XML outputs. It has:
- A **Node.js/Express backend** that serves API routes and evaluates nexl scripts
- An **Angular 5 frontend** (SPA) served as static files from `site/nexl/site/`
- A **SQLite database** (`~/.nexl/app-data/nexl-data.db`) for versioning
- A **file-system storage** for user-created `.js` nexl scripts (stored under `~/.nexl/storage/`)

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | v24 (dev machine) |
| Backend framework | Express | 4.16.3 |
| Frontend framework | Angular | 5.2.9 |
| **TypeScript** | TypeScript | **2.5.3** (old — important for library compatibility) |
| UI widgets | jqwidgets | 5.7.2 |
| DOM/jQuery | jQuery | 3.2.1 |
| Editor | ACE Editor | (served from `site/nexl/site/ace/`) |
| Database | better-sqlite3 | 12.6.2 |
| Auth | bcryptjs + ldapjs-no-python | — |
| Expression engine | nexl-engine | 3.3.0 |
| Logging | Winston | — |
| Build tool | Angular CLI (ng build --prod) | — |

---

## Directory Structure

```
nexl-js/
├── bin/nexl                      ← SERVER ENTRY POINT (node ./bin/nexl or npm run nexl)
├── backend/
│   ├── api/
│   │   ├── conf-mgmt.js          ← Config/settings manager
│   │   ├── db.js                 ← SQLite init + schema
│   │   ├── security.js           ← Auth/permissions logic
│   │   ├── storage-utils.js      ← File read/write with conflict detection
│   │   └── versioning.js         ← saveRevision(), getRevision(), listRevisions()
│   ├── common/
│   │   ├── consts.js             ← App-wide constants
│   │   └── rest-urls.js          ← REST URL constants (DI_CONSTANTS, REST_URLS)
│   ├── nexl-app/
│   │   └── nexl-app.js           ← Express app setup + middleware order
│   └── routes/
│       ├── storage-route.js      ← /nexl/storage/* endpoints
│       ├── users-route.js        ← /nexl/users/* endpoints
│       ├── versioning-route.js   ← /nexl/versioning/* endpoints
│       ├── permissions-route.js
│       ├── settings-route.js
│       └── webhooks-route.js
├── frontend/
│   ├── package.json              ← Angular dependencies (TypeScript 2.5.3!)
│   └── src/app/main/
│       ├── services/
│       │   ├── message.service.ts        ← Central pub/sub message bus
│       │   ├── global-components.service.ts ← Shared component references
│       │   ├── appearance.service.ts     ← Theme (getTheme())
│       │   └── utils.service.ts          ← UtilsService (resolveFileName, etc.)
│       ├── header/
│       │   └── main-menu/
│       │       └── main-menu.component.ts ← Menu enable/disable logic
│       ├── filemanager/
│       │   ├── storage-files-editor/     ← Main ACE editor + tab management
│       │   ├── storage-files-explorer/   ← File tree component
│       │   └── version-history/          ← Version history modal (custom feature)
│       ├── misc/
│       │   ├── confirmbox/               ← Confirm dialog component
│       │   ├── messagebox/               ← Message/alert dialog component
│       │   └── inputbox/                 ← Input dialog component
│       └── settingsdialogs/
│           ├── users/                    ← User management (admins.component.ts pattern)
│           └── admins/                   ← Admin management
├── site/nexl/site/               ← COMPILED FRONTEND OUTPUT (do not edit manually)
├── docs/
│   └── auth-and-ldap.md          ← Auth/LDAP/register API documentation
├── check-db.js                   ← Utility: query SQLite versioning DB directly
└── package.json                  ← Root: version 3.4.0, entry bin/nexl
```

---

## How to Build & Run

```powershell
# Build frontend (from project root or frontend/)
cd C:\workspaces\nexl-js\frontend
npm run build
# Output goes to: C:\workspaces\nexl-js\site\nexl\site\

# Start server
cd C:\workspaces\nexl-js
node ./bin/nexl
# or: npm run nexl

# Check versioning DB directly
node C:\workspaces\nexl-js\check-db.js
```

Default port: **8080**. App data stored in `C:\Users\<user>\.nexl\app-data\`.

---

## Express Middleware Order (nexl-app.js)

1. `express.static('site/')` — serves ALL static files first (ACE, Angular bundles, etc.)
2. Static site root — serves `index.html` for SPA navigation
3. Session management
4. Body parser (JSON + URL-encoded)
5. Cookie parser
6. **`security.authInterceptor`** — validates sessions on all API routes
7. Logger interceptor
8. API routes:
   - `/nexl/storage/*` → storageRoute
   - `/nexl/users/*` → usersRoute
   - `/nexl/permissions/*` → permissionsRoute
   - `/nexl/settings/*` → settingsRoute
   - `/nexl/webhooks/*` → webhooksRoute
   - `/nexl/versioning/*` → versioningRoute
   - `/nexl/*` → reservedRoute
   - **`/` → expressionsRoute** ← CATCH-ALL: evaluates any unmatched URL as a nexl expression
9. 404 interceptor
10. Error handler

> ⚠️ The catch-all expressions route at `/` is important: any bad URL (e.g., misconfigured ACE mode file path) hits this route and returns a nexl evaluation error.

---

## Auth System

**Files in `~/.nexl/app-data/`:**
- `users.js` — hashed passwords + `token2ResetPassword` for password resets
- `admins.js` — plain array of admin usernames: `["admin", "someuser"]`
- `settings.js` — app settings including LDAP config
- `nexl-data.db` — SQLite versioning database

**Admin user:** Created on first run. Token for registering new users:
```bash
curl -X POST http://localhost:8080/nexl/users/generate-token \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<admin-password>"}'
```
Then register:
```bash
curl -X POST http://localhost:8080/nexl/users/register \
  -H "Content-Type: application/json" \
  -d '{"token":"<token>","username":"newuser","password":"secret"}'
```

**LDAP:** Configured in `settings.js`. LDAP users are made admin by adding their username to `admins.js`.

**`AUTH_CHANGED` message** broadcasts: `{ isAdmin, hasReadPermission, hasWritePermission, isLoggedIn, username }`

---

## Key Backend APIs

### Storage
| Method | URL | Body | Notes |
|--------|-----|------|-------|
| POST | `/nexl/storage/load-file-from-storage` | `{relativePath}` | Returns `{"file-body": content, "file-load-time": ts}` |
| POST | `/nexl/storage/save-file-to-storage` | `{relativePath, content, fileLoadTime}` | Saves to disk + creates revision. `fileLoadTime` for conflict detection |
| GET | `/nexl/storage/list-files` | — | Returns file tree |

### Versioning
| Method | URL | Body | Returns |
|--------|-----|------|---------|
| POST | `/nexl/versioning/list` | `{filePath}` | `{revisions: [{revision_no, saved_at, size_bytes, saved_by, label}]}` |
| POST | `/nexl/versioning/get` | `{filePath, revisionNo}` | `{revision: {content, ...}}` |
| POST | `/nexl/versioning/restore` | `{filePath, revisionNo}` | `{}` — writes to disk + creates new revision |

### Users
| Method | URL | Body | Notes |
|--------|-----|------|-------|
| POST | `/nexl/users/generate-token` | `{username, password}` | Returns token for registering users |
| POST | `/nexl/users/register` | `{token, username, password}` | Creates new user |
| POST | `/nexl/users/login` | `{username, password}` | |
| POST | `/nexl/users/logout` | — | |

---

## SQLite DB Schema

```sql
-- All file revision snapshots (append-only)
CREATE TABLE file_revisions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path    TEXT    NOT NULL,
  revision_no  INTEGER NOT NULL,
  saved_at     INTEGER NOT NULL,   -- Unix ms timestamp
  saved_by     TEXT    NOT NULL,
  label        TEXT,               -- null or "Restored from revision #N"
  content      TEXT    NOT NULL,   -- full file content
  content_hash TEXT    NOT NULL,   -- SHA-256 hex
  size_bytes   INTEGER NOT NULL,
  is_deleted   INTEGER NOT NULL DEFAULT 0
);

-- Latest state per file
CREATE TABLE file_metadata (
  file_path      TEXT PRIMARY KEY,
  first_saved_at INTEGER NOT NULL,
  last_saved_at  INTEGER NOT NULL,
  last_saved_by  TEXT    NOT NULL,
  revision_count INTEGER NOT NULL DEFAULT 0,
  current_hash   TEXT    NOT NULL
);
```

**Key behaviors:**
- `saveRevision()` is a NO-OP if `content_hash` matches `current_hash` (no duplicate revisions)
- Disk file = live version; SQLite = immutable snapshots; they stay in sync on every save
- `saveFileToStorage(path, content, undefined)` → skips conflict check (always writes)
- `saveFileToStorage(path, content, fileLoadTime)` → conflict detection (returns current file if server-side mtime > fileLoadTime)

---

## Frontend Architecture

### Angular patterns in this codebase

**Message bus (central pub/sub):**
```typescript
// Send:
this.messageService.sendMessage(MESSAGE_TYPE.LOAD_FILE_FROM_STORAGE, {relativePath, forceReload: true});
// Receive:
this.messageService.getMessage().subscribe(msg => { if (msg.type === MESSAGE_TYPE.X) { ... } });
```

**jqwidgets imperative API** (used in admins, users, version-history):
```typescript
// Create:
this.grid = jqwidgets.createInstance('#elementId', 'jqxGrid', { ...options });
// Events (NOT jQuery .on()!):
this.grid.addEventHandler('rowselect', (event) => { const row = event.args.row; });
// vs Angular template binding: (onRowselect)="handler($event)"
```

**jqxWindow template rule:**
- With `[title]="binding"` input: needs exactly **ONE** child `<div>` as the body
- Without `[title]`: first child `<div>` = title bar, second = body
- Extra sibling `<div>`s are silently ignored

**Confirm dialog:**
```typescript
this.globalComponentsService.confirmBox.open({
  title: 'Confirm',
  label: 'Are you sure?',
  height: 130,
  callback: (data) => {
    if (data.isConfirmed === true) { /* user clicked Yes */ }
  }
});
```

### ACE Editor (critical: basePath)

ACE mode files live at: `site/nexl/site/nexl/site/ace/mode-*.js`  
Served at URL: `/nexl/site/nexl/site/ace/mode-*.js`

**Every component that creates an ACE editor MUST set basePath first:**
```typescript
ace.config.set('basePath', 'nexl/site/ace');  // relative, resolves from /nexl/site/
const editor = ace.edit('elementId');
editor.setOptions({
  readOnly: true,
  useWorker: false,  // prevents background HTTP worker requests
  theme: 'ace/theme/xcode',
  mode: 'ace/mode/javascript',
  ...
});
```

> ⚠️ If `basePath` is not set, ACE requests `mode-javascript.js` with no prefix → hits the catch-all expressions route → backend error logged: "The [mode-javascript.js] file doesn't exist"

### Version History Feature (custom, added this session)

**Component:** `frontend/src/app/main/filemanager/version-history/`

**Features:**
- Admin-only modal (gated by `isAdmin` from `AUTH_CHANGED`)
- Grid showing all revisions (rev#, timestamp, author, size, label)
- ACE read-only preview of selected revision content
- **Diff toggle**: shows unified diff (revision → current) using `diff@4` library
- **Restore**: calls backend restore endpoint, then auto-reloads the open tab via `LOAD_FILE_FROM_STORAGE` with `forceReload: true`

**Menu gate:** `main-menu.component.ts` checks `isAdmin` before enabling "Versions" menu item.

**`forceReload` mechanism** (added to storage-files-editor):
```typescript
// If tab is already open + forceReload=true:
// → fetches file from disk, updates editor content in-place, clears "unsaved changes" marker
messageService.sendMessage(MESSAGE_TYPE.LOAD_FILE_FROM_STORAGE, {
  relativePath: '/path/to/file.js',
  forceReload: true
});
```

---

## Important Known Behaviors / Gotchas

1. **TypeScript 2.5.3** — Do NOT use `diff@5+` (requires modern TS). Use `diff@4`.  
   Use `(Diff as any).createPatch(...)` for type compatibility.

2. **Static files served before API routes** — Express.static runs first. This is why ACE files serve correctly once basePath is set. Bad ACE paths hit the expressions catch-all.

3. **`admins.js` format** — Plain array: `["admin"]`. Not an object. Adding username here grants admin access.

4. **`users.js` format** — Contains `token2ResetPassword.token` which is used for user registration (not password reset despite the name).

5. **Theme class** — `AppearanceService.getTheme()` returns a string like `'energyblue'` used for all jqwidgets `theme:` options.

6. **File load time conflict detection** — Backend compares `fileLoadTime` (client's last-loaded mtime) with actual disk mtime. If disk is newer, returns current content instead of saving. Pass `undefined` (not `null`) to bypass.

7. **jqwidgets imperative vs declarative** — Components using `jqwidgets.createInstance()` must use `addEventHandler()` for events. Angular template-bound jqwidgets components use `(onEvent)` bindings.

8. **`MESSAGE_TYPE.FILE_SAVED`** — Emitted after a successful file save. Version history listens to this to auto-refresh the revision list.

---

## Files Modified This Session

- `backend/routes/versioning-route.js` — Fixed restore: `null` → `undefined` for fileLoadTime (so conflict check is skipped and disk write always happens)
- `frontend/src/app/main/filemanager/version-history/version-history.component.ts` — Full version history + diff feature
- `frontend/src/app/main/filemanager/version-history/version-history.component.html` — jqxWindow template fix + diff/preview UI
- `frontend/src/app/main/filemanager/storage-files-editor/storage-files-editor.component.ts` — Added `forceReload` support in `loadFileFromStorage()`
- `frontend/src/app/main/header/main-menu/main-menu.component.ts` — Admin gate on version history menu item
- `frontend/package.json` — Added `"diff": "^4.0.2"`
- `docs/auth-and-ldap.md` — Auth/LDAP documentation
- `check-db.js` (root) — SQLite query utility

---

## Useful Debug Commands

```powershell
# Check what's in the versioning DB
node C:\workspaces\nexl-js\check-db.js

# Rebuild frontend after changes
cd C:\workspaces\nexl-js\frontend && npm run build

# Start server
cd C:\workspaces\nexl-js && node ./bin/nexl
```
