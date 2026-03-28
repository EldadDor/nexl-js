# Nexl-JS Refactor Scan Report

## Project Overview

- **Name**: Nexl (nexl-js)
- **Version**: 3.4.0 (backend), 0.0.0 (frontend)
- **Description**: Configuration hosting server. Stores configurations as native JavaScript files, exposes them via HTTP with a custom expression evaluation language (`nexl-engine`).
- **License**: Apache-2.0

---

## 1. Repository Structure

```
nexl-js/
├── backend/                   # Node.js Express server
│   ├── api/                   # Core business logic
│   ├── common/                # Shared constants (also used by frontend via script includes)
│   ├── interceptors/          # Express middleware
│   ├── nexl-app/              # App bootstrap / server startup
│   └── routes/                # REST route handlers
├── frontend/                  # Angular 5 web UI
│   ├── src/
│   │   ├── app/               # Angular application source
│   │   ├── environments/      # Environment configs
│   │   ├── nexl/              # Third-party assets (ACE editor, CodeMirror)
│   │   ├── styles.css         # Global stylesheet
│   │   ├── index.html
│   │   └── main.ts
│   ├── jqwidgets/             # jqWidgets 5.7.2 (UI components + 32 themes)
│   ├── angular.json
│   └── package.json
├── bin/nexl                   # Entry point script
├── site/                      # Production build output
├── tests/                     # Backend integration tests (18 files)
├── package.json               # Root/backend dependencies
├── CHANGELOG
└── README.md
```

---

## 2. Technology Stack

### Backend

| Technology | Version | Role |
|---|---|---|
| Node.js | >=6.0 | Runtime |
| Express | ~4.16.3 | HTTP framework |
| nexl-engine | 3.3.0 | Expression evaluation (core value) |
| bcryptjs | 2.4.3 | Password hashing |
| express-session | — | Session management |
| winston | 2.4.4 | Logging |
| cron | ^1.7.2 | Scheduled backups |
| ldapjs-no-python | ^1.0.3 | LDAP authentication |
| axios | ^0.19.2 | Webhook HTTP calls |
| archiver | ^3.1.1 | ZIP backup creation |

### Frontend

| Technology | Version | Role |
|---|---|---|
| Angular | 5.2.9 | UI framework |
| TypeScript | 2.5.3 | Language |
| RxJS | 5.5.2 | Reactivity / event bus |
| jqWidgets | 5.7.2 | UI components (commercial) |
| jQuery | 3.2.1 | DOM manipulation |
| ACE Editor | (bundled) | Code editing |
| CodeMirror | (bundled) | Diff viewing |
| Angular CLI | 1.6.8 | Build tooling |

---

## 3. Backend Architecture

### Server Startup Flow

```
bin/nexl
  → nexl-app.create()
  → nexl-app.start()
      ├── createStorageDirIfNeeded()
      ├── cacheStorageFiles()          ← loads all JS files into memory
      ├── startHTTPServer() / startHTTPSServer()
      └── scheduleAutomaticBackup()    ← CRON-based ZIP backup
```

### REST API Endpoints

| Route Prefix | File | Lines | Purpose |
|---|---|---|---|
| `/nexl/storage/*` | `storage-route.js` | 438 | File CRUD, move, rename, search |
| `/nexl/users/*` | `users-route.js` | 278 | Authentication, user management |
| `/nexl/permissions/*` | `permissions-route.js` | 63 | Access control |
| `/nexl/settings/*` | `settings-route.js` | 118 | Server configuration |
| `/nexl/webhooks/*` | `webhooks-route.js` | 157 | Webhook management |
| `/nexl/general/*` | `general-route.js` | — | OS/version info |
| `*` (root) | `expressions-route.js` | 188 | **Core**: Expression evaluation |

#### Storage API (all POST)
- `/nexl/storage/set-var` — Update a JS variable in a file
- `/nexl/storage/md` — Get metadata/available expressions
- `/nexl/storage/find-in-files` — Full-text search across storage
- `/nexl/storage/move`, `/rename`, `/delete`, `/make-dir` — File/dir operations
- `/nexl/storage/get-tree-items-hierarchy` — Directory tree
- `/nexl/storage/load-file-from-storage`, `/save-file-to-storage` — Read/write files
- `/nexl/storage/list-files`, `/list-dirs`, `/list-files-and-dirs` — Listing
- `/nexl/storage/reindex-files`, `/backup-storage` — Maintenance

#### Users API (all POST)
- `/nexl/users/login`, `/logout`, `/register` — Authentication
- `/nexl/users/change-password`, `/rename-user`, `/remove-user` — Profile
- `/nexl/users/list-users`, `/enable-disable-user` — Admin management
- `/nexl/users/generate-token`, `/resolve-status` — Token & status

#### Expressions API (GET/POST at root path)
- Evaluates `nexl-engine` expressions from JS config files
- Supports JSONP callbacks
- Returns JSON or raw text

### Backend File Risk Assessment

| File | Lines | Risk | Reason |
|---|---|---|---|
| `api/storage-utils.js` | 550 | 🔴 HIGH | Monolithic: file I/O + caching + webhooks + search + backup |
| `routes/storage-route.js` | 438 | 🟠 MEDIUM-HIGH | Business logic mixed into route handlers |
| `api/security.js` | 245 | 🟠 MEDIUM | All auth logic concentrated; critical path |
| `api/conf-migration.js` | 238 | 🟡 MEDIUM | Version migration logic—sensitive to changes |
| `api/conf-mgmt.js` | 210 | 🟡 MEDIUM | Config file loading/saving |
| `backend/common/schemas.js` | 280 | 🟡 MEDIUM | Validation schemas—changes break API compatibility |

### Data Persistence (Current)

All data is **file-based**. No database.

| Data Type | Format | Location |
|---|---|---|
| User configurations | `.js` files (nexl-engine) | Configurable storage directory |
| Server settings | `settings.json` | App data directory |
| Users & tokens | `users.json` | App data directory |
| Permissions | `permissions.json` | App data directory |
| Admins | `admins.json` | App data directory |
| Webhooks | `webhooks.json` | App data directory |
| Backups | ZIP archives | Configurable backup directory |

All JSON config files use the structure: `{ "version": N, "data": { ... } }`

In-memory caching: storage JS files are cached on startup with file system watchers for invalidation.

---

## 4. Frontend Architecture

### Module Structure

```
app/
├── app.component.*           ← Root shell
├── app.module.ts             ← Root module
└── main/
    ├── main.component.*      ← Main layout (header + content)
    ├── main.module.ts        ← Feature module (148 lines, 37 components declared)
    ├── header/               ← Navigation bar
    │   ├── auth-menu/        ← Login/logout/user info
    │   ├── main-menu/        ← Feature navigation (Settings, About, etc.)
    │   └── nexl-logo/        ← Clickable logo
    ├── filemanager/          ← Core editing interface
    │   ├── content.component.*                     ← jqxSplitter layout shell
    │   ├── storage-files-explorer/                 ← LEFT PANEL: file tree
    │   ├── storage-files-editor/                   ← CENTER: tabbed ACE editor
    │   │   ├── diffswindow/                        ← Diff viewer
    │   │   └── diffsconfirmbox/                    ← Save confirmation
    │   └── http-requests-buider-and-tester/        ← BOTTOM: HTTP test tool
    │       └── args/                               ← URL parameters panel
    ├── services/             ← Angular services
    ├── authdialogs/          ← Login / Register / Change password
    ├── settingsdialogs/      ← Server settings / Users / Permissions / Webhooks / Appearance
    └── misc/                 ← Shared dialogs (messagebox, confirmbox, inputbox, loader, etc.)
```

### Component Inventory (37 components)

| Component | File Lines | Risk | Description |
|---|---|---|---|
| `StorageFilesExplorerComponent` | **999** | 🔴 CRITICAL | File tree browser, context menus, drag/drop |
| `StorageFilesEditorComponent` | **732** | 🔴 CRITICAL | Tabbed ACE editor, file open/save |
| `HttpRequestsBuilderAndTesterComponent` | **489** | 🔴 HIGH | HTTP request builder/executor/viewer |
| `WebhooksComponent` | 331 | 🟠 MEDIUM | Webhook CRUD |
| `PermissionsComponent` | 331 | 🟠 MEDIUM | Permission matrix |
| `UsersComponent` | 299 | 🟠 MEDIUM | User management |
| `SettingsComponent` | 245 | 🟡 MEDIUM | Server config form |
| `ArgsComponent` | 192 | 🟡 LOW | Query parameter rows |
| `AssignPermissionsComponent` | 115 | 🟢 LOW | Permission assignment |
| `FindInFilesComponent` | 128 | 🟢 LOW | Text search dialog |
| `WebhookComponent` | 123 | 🟢 LOW | Webhook notifier |
| `LoginComponent` | 113 | 🟢 LOW | Login form |
| `RegisterComponent` | 113 | 🟢 LOW | Registration form |
| Remaining 24 | <100 each | 🟢 LOW | Dialogs, misc components |

### Services

| Service | Purpose |
|---|---|
| `MessageService` | Global event bus (RxJS Subject, ~30 message types) |
| `AuthService` | Authentication API calls |
| `HttpRequestService` | HTTP wrapper (POST, POST-to-root) |
| `GlobalComponentsService` | Registry of modal dialog refs |
| `LocalStorageService` | Browser localStorage for tab state, splitter positions |
| `AppearanceService` | jqWidgets theme + font size (32 themes, stored in localStorage) |
| `UtilsService` | Common utilities, string parsing, API URL building |
| `AuthHttpInterceptor` | Adds auth token header to all outgoing requests |

### Styling Approach

- **No SCSS/LESS** — plain CSS only
- **Global styles**: `frontend/src/styles.css` (minimal — z-index management, ACE editor sizing, message icon sprites)
- **Component styles**: Each component has a `.component.css` file with basic layout using:
  - `float: left/right` (no flexbox, no grid)
  - Fixed pixel widths for form labels (`width: 120px`, `width: 180px`, etc.)
  - Repeated patterns across 20+ component CSS files (`.button`, `.buttons`, `.item`, `.container`)
- **jqWidgets themes**: 32 themes (including `dark`, `metrodark`, `ui-darkness`, `black`, `shinyblack`) handled entirely by jqWidgets JavaScript; no CSS custom properties or root-class theming
- **Current dark mode**: Selecting a dark jqWidgets theme partially darkens jqx-controlled elements but leaves Angular-native areas (backgrounds, labels, icons) unchanged → **incomplete dark mode**

### Communication Patterns

```
Angular Component
  → MessageService.sendMessage(type, data)   ← event bus
  → HttpRequestService.post(url, data)       ← API calls
    → AuthHttpInterceptor (adds token)
    → Express Backend
    → Response → Component
```

Message types include: `AUTH_CHANGED`, `LOAD_FILE_FROM_STORAGE`, `SAVE_FILE_TO_STORAGE`, `TAB_*`, `EVAL_NEXL_EXPRESSION`, `RELOAD_FILES`, `UPDATE_UI`, and ~20 more.

---

## 5. Refactoring Hotspots (Ranked)

### 🔴 Rank 1 — `storage-files-explorer.component.ts` (999 lines)

**Path**: `frontend/src/app/main/filemanager/storage-files-explorer/storage-files-explorer.component.ts`

**Problems**:
- Handles tree rendering, context menu actions, file CRUD dialogs, drag-drop, item selection, and message bus subscriptions all in one class
- Subscribes to 10+ message types in one `switch` statement
- Direct manipulation of jqxTree item data structures throughout
- No child components; all logic inlined

**Split plan**: `FileTreeComponent` + `ContextMenuService` + `FileActionsService`

---

### 🔴 Rank 2 — `storage-files-editor.component.ts` (732 lines)

**Path**: `frontend/src/app/main/filemanager/storage-files-editor/storage-files-editor.component.ts`

**Problems**:
- Manages tab lifecycle, ACE editor integration, save/load, diff trigger, and expression execution
- Subscribes to 15+ message types
- Accesses ACE editor via `document.getElementById()` — tight DOM coupling
- Tab state serialized directly into localStorage within the component

**Split plan**: `TabManagerComponent` + `AceEditorComponent` + `FilePersistenceService`

---

### 🔴 Rank 3 — `http-requests-builder-and-tester.component.ts` (489 lines)

**Path**: `frontend/src/app/main/filemanager/http-requests-buider-and-tester/`

**Problems**:
- Request builder, URL construction, execution, and response display all inlined
- Dynamic argument rows managed manually
- Typo in directory name: `http-requests-buider-and-tester` (missing `l`)

**Split plan**: `RequestFormComponent` + `ResponseViewerComponent` + `HttpTesterService`

---

### 🟠 Rank 4 — `api/storage-utils.js` (550 lines)

**Problems**:
- Mixed responsibilities: file I/O, in-memory caching, webhooks, search, backup
- Complex nested Promise chains
- Cache invalidation logic interleaved with file write logic

**Split plan**: `fileOperations.js` + `fileCache.js` + `backupManager.js` + `searchManager.js`

---

### 🟠 Rank 5 — Repeated CSS Patterns (20+ component files)

Every component CSS repeats the same pattern:
```css
.button { float: right; margin-left: 5px; }
.buttons { margin: 10px 0 0 0; }
.item { float: left; margin-top: 10px; }
.item label { display: inline-block; float: left; }
.container { overflow: hidden; }
```

**Fix**: Extract to shared utility CSS classes or introduce SCSS with shared mixins.

---

### 🟡 Rank 6 — No SCSS, No CSS Custom Properties

The current styling has no theming infrastructure beyond jqWidgets theme switching. There are no CSS custom properties (`--var`), no root-class toggling, and no semantic color tokens.

**Fix**: Introduce a `themes.css` with CSS custom properties for `[data-theme="light"]` / `[data-theme="dark"]` — this is the foundation for a working dark mode.

---

### 🟡 Rank 7 — Mixed Responsibilities in `main.module.ts`

The single feature module declares all 37 components and imports all 20+ jqWidget modules. There is no lazy loading and no sub-feature modules.

**Fix**: Split into feature modules (`FileManagerModule`, `SettingsModule`, `AuthModule`, `SharedModule`).

---

### 🟡 Rank 8 — `GlobalComponentsService` Anti-Pattern

Stores live references to modal window components (messagebox, confirmbox, inputbox) via `@ViewChild` + service registration. This creates hidden dependencies and makes testing impossible.

**Fix**: Replace with a proper `DialogService` that renders dialogs dynamically via `ComponentFactoryResolver`.

---

## 6. Testing Status

| Area | Status |
|---|---|
| Backend integration tests | ✅ 18 test files (expression, security, storage, webhooks) |
| Frontend unit/component tests | ❌ None |
| E2E tests | ❌ None (Protractor configured but unused) |
| CI/CD | ❌ None |

---

## 7. Security Observations

| Item | Status |
|---|---|
| Password hashing (bcrypt) | ✅ |
| Session-based authentication | ✅ |
| Permission checks on each request | ✅ |
| Path traversal prevention | ✅ |
| Rate limiting | ❌ Missing |
| CSRF protection | ❌ Not visible |
| LDAP password in config file | ⚠️ Masked in UI but stored plaintext in settings.json |
| Webhook URL validation | ⚠️ No explicit sanitization visible |

---

## 8. Positive Architectural Notes

- Expression engine is cleanly abstracted into `nexl-engine` — it is not a risk area
- Feature-based route organization in backend is clear and maintainable
- AuthHttpInterceptor cleanly handles token injection
- Automatic backup system is built-in
- Shared constants across backend/frontend via script includes is pragmatic

---

## 9. Summary Table

| Dimension | Assessment |
|---|---|
| Backend organization | Good (feature-based routes, clear separation of concerns except storage-utils) |
| Frontend organization | Poor (monolithic components, no feature modules, no lazy loading) |
| Styling | Minimal / fragile (plain CSS, float-based layout, no theming infrastructure) |
| Dark mode | Partial (jqWidgets theme only; Angular areas unaffected) |
| Test coverage | Backend partial; Frontend zero |
| TypeScript rigor | Weak (`any` types prevalent, no strict mode) |
| Scalability | File-based storage limits horizontal scaling |
| Deployability | Manual only; no Docker or CI/CD |
