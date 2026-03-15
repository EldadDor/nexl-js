# UI Refactor Plan

## Objective

Modernize the Angular 5 UI of Nexl-JS with a cleaner, more polished look, working **Dark Theme**, and improved UX — without upgrading Angular or jqWidgets, and without breaking existing functionality.

---

## Constraints

- **Do not upgrade Angular** (stays at 5.2.9)
- **Do not upgrade jqWidgets** (stays at 5.7.2)
- **Do not change any API contracts** or backend behavior
- Every change must be **reversible** — no large rewrites at once
- All existing functionality must continue working after each step

---

## Phase Overview

| Phase | Focus | Risk |
|---|---|---|
| 1 | CSS design system + Dark Theme infrastructure | 🟢 Low (CSS-only) |
| 2 | Global layout improvements (header, splitters) | 🟡 Medium |
| 3 | Shared dialog / form styling | 🟢 Low |
| 4 | Mega-component decomposition (Explorer, Editor) | 🔴 High |
| 5 | HTTP Tester component refactor | 🟠 Medium |
| 6 | Feature module splitting + lazy loading | 🟠 Medium |
| 7 | Error states, empty states, loading UX | 🟢 Low |
| 8 | Accessibility + responsive polish | 🟡 Medium |

---

## Phase 1 — CSS Design System & Dark Theme Infrastructure

### 1.1 Introduce CSS Custom Properties

Create `frontend/src/themes.css` (added to `angular.json` styles array before `styles.css`):

```css
/* Light theme (default) */
:root, [data-theme="light"] {
  --color-bg-primary:    #ffffff;
  --color-bg-secondary:  #f4f5f7;
  --color-bg-surface:    #fafafa;
  --color-border:        #d1d5db;
  --color-text-primary:  #1a1a2e;
  --color-text-secondary:#6b7280;
  --color-text-muted:    #9ca3af;
  --color-accent:        #3b82f6;
  --color-accent-hover:  #2563eb;
  --color-danger:        #ef4444;
  --color-success:       #22c55e;
  --color-warning:       #f59e0b;
  --color-header-bg:     #1e293b;
  --color-header-text:   #f1f5f9;
  --font-size-base:      13px;
  --font-family-base:    'Segoe UI', system-ui, sans-serif;
  --font-family-mono:    'Consolas', 'Courier New', monospace;
  --border-radius:       4px;
  --spacing-xs:          4px;
  --spacing-sm:          8px;
  --spacing-md:          12px;
  --spacing-lg:          16px;
  --spacing-xl:          24px;
  --shadow-sm:           0 1px 3px rgba(0,0,0,0.08);
  --shadow-md:           0 4px 12px rgba(0,0,0,0.12);
}

/* Dark theme */
[data-theme="dark"] {
  --color-bg-primary:    #0f172a;
  --color-bg-secondary:  #1e293b;
  --color-bg-surface:    #162032;
  --color-border:        #334155;
  --color-text-primary:  #e2e8f0;
  --color-text-secondary:#94a3b8;
  --color-text-muted:    #64748b;
  --color-accent:        #60a5fa;
  --color-accent-hover:  #93c5fd;
  --color-danger:        #f87171;
  --color-success:       #4ade80;
  --color-warning:       #fbbf24;
  --color-header-bg:     #0f172a;
  --color-header-text:   #f1f5f9;
  --shadow-sm:           0 1px 3px rgba(0,0,0,0.4);
  --shadow-md:           0 4px 12px rgba(0,0,0,0.5);
}
```

### 1.2 Theme Toggle Logic

**File to create**: `frontend/src/app/main/services/theme.service.ts`

```typescript
export type Theme = 'light' | 'dark';

export class ThemeService {
  private static KEY = 'nexl-theme';

  static get(): Theme {
    const stored = localStorage.getItem(this.KEY) as Theme;
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  static set(theme: Theme): void {
    localStorage.setItem(this.KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
    // Also update jqWidgets theme to matching dark/light variant
  }

  static init(): void {
    this.set(this.get());
  }

  static toggle(): Theme {
    const next = this.get() === 'dark' ? 'light' : 'dark';
    this.set(next);
    return next;
  }
}
```

**Initialize in** `frontend/src/main.ts`:
```typescript
import { ThemeService } from './app/main/services/theme.service';
ThemeService.init(); // before bootstrapModule
```

### 1.3 jqWidgets Theme Mapping

When dark theme is active, switch jqWidgets theme to `metrodark`; when light, switch to `metro` (or user-selected). Update `AppearanceService` to call `ThemeService.set()` when a dark jqWidgets theme is chosen.

```typescript
// In AppearanceService.save():
const isDark = DARK_JQX_THEMES.includes(data['theme']);
ThemeService.set(isDark ? 'dark' : 'light');
```

Dark jqWidgets themes: `dark`, `metrodark`, `ui-darkness`, `black`, `shinyblack`, `highcontrast`

### 1.4 Apply CSS Variables to Global Styles

Update `frontend/src/styles.css` to use the new variables:

```css
html, body {
  height: calc(100% - 20px);
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: var(--font-family-base);
  font-size: var(--font-size-base);
}
```

### 1.5 Shared Utility Classes

Add to `themes.css` (after variables):

```css
/* Replace repeated per-component CSS patterns */
.nx-buttons       { margin: 10px 0 0 0; }
.nx-button        { float: right; margin-left: var(--spacing-sm); }
.nx-form-item     { display: flex; align-items: center; margin-top: var(--spacing-md); margin-left: var(--spacing-xl); }
.nx-form-label    { width: 180px; flex-shrink: 0; color: var(--color-text-secondary); font-size: 0.9em; }
.nx-form-section  { overflow: hidden; padding: var(--spacing-md); }
.nx-surface       { background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: var(--border-radius); }
.nx-badge         { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 0.75em; font-weight: 600; }
.nx-badge--info   { background: var(--color-accent); color: white; }
.nx-badge--danger { background: var(--color-danger); color: white; }
```

---

## Phase 2 — Global Layout Improvements

### 2.1 Header Redesign

**File**: `frontend/src/app/main/header/header.component.css`

Current: basic float-based layout, no background color.

Changes:
- Set `background-color: var(--color-header-bg)` on header
- Set `color: var(--color-header-text)` on text/icons
- Add `box-shadow: var(--shadow-sm)` for depth
- Replace `float` with `display: flex; align-items: center`
- Add theme toggle button (sun/moon icon) to auth-menu area

**File**: `frontend/src/app/main/main.component.css`

Change `.content { height: calc(100% - 79px) }` to use a CSS variable for header height consistency.

### 2.2 Splitter Panel Borders

The jqxSplitter creates panels. Apply custom border/background via jqWidgets `theme` and CSS overrides:

```css
/* In styles.css */
.jqx-splitter-bar {
  background-color: var(--color-border) !important;
}
.jqx-panel {
  background-color: var(--color-bg-secondary) !important;
}
```

### 2.3 Logo Area

Update nexl-logo component to respect `--color-header-bg` background. Add a `title` attribute for tooltip.

---

## Phase 3 — Dialog & Form Styling

### 3.1 Standardize All Dialog Components

All settings dialogs (settings, users, permissions, webhooks, appearance, auth dialogs) share the same pattern. Replace per-component repeated CSS with `nx-*` utility classes from `themes.css`.

**Files to update** (replace local `.button`, `.buttons`, `.item`, `.item label`, `.container` with `nx-*` classes):
- `login.component.css` + HTML
- `register.component.css` + HTML
- `changepassword.component.css` + HTML
- `settings.component.css` + HTML
- `users.component.css` + HTML
- `webhooks.component.css` + HTML
- `permissions.component.css` + HTML
- `appearance.component.css` + HTML
- `messagebox.component.css` + HTML
- `confirmbox.component.css` + HTML
- `inputbox.component.css` + HTML
- `findfile.component.css` + HTML
- `findinfiles.component.css` + HTML
- `webhook.component.css` + HTML

### 3.2 Dialog Header Styling

jqWidgets windows have `.jqx-window-header`. Add global override:
```css
.jqx-window-header {
  background: var(--color-bg-secondary) !important;
  color: var(--color-text-primary) !important;
  border-bottom: 1px solid var(--color-border) !important;
  font-weight: 600;
  font-size: 13px;
}
```

### 3.3 Message Icons

Replace bitmap `.png` icons with SVG or CSS-drawn icons that inherit color from `--color-*` variables.

---

## Phase 4 — Mega-Component Decomposition

> ⚠️ This phase carries the most risk. Implement step by step with identical behavior at each sub-step.

### 4.1 `StorageFilesExplorerComponent` (999 → ~3 files)

**Strategy**: Extract responsibilities into focused components/services without changing message bus contracts.

| Extract | Target File | What Goes There |
|---|---|---|
| `FileActionsService` | `services/file-actions.service.ts` | API calls: move, rename, delete, makeDir, loadFile |
| `ContextMenuHandler` | `storage-files-explorer/context-menu.handler.ts` | Context menu config, action dispatch |
| `FileTreeComponent` | (remains as `StorageFilesExplorerComponent`) | Slimmed-down tree rendering + event handling |

Steps:
1. Extract all HTTP calls into `FileActionsService`
2. Extract context menu configuration array and action routing into a handler class
3. What remains in the component: tree init, item selection, incoming messages → call service/handler

### 4.2 `StorageFilesEditorComponent` (732 → ~3 files)

| Extract | Target File | What Goes There |
|---|---|---|
| `FilePersistenceService` | `services/file-persistence.service.ts` | save, load, reindex API calls |
| `TabStateService` | `services/tab-state.service.ts` | Tab open/close/restore, localStorage management |
| `AceEditorWrapperComponent` | `storage-files-editor/ace-editor-wrapper/` | ACE init, options, value get/set |

Steps:
1. Extract `FilePersistenceService` (pure API calls, testable)
2. Extract tab state management to `TabStateService`
3. Wrap ACE editor access in a component that uses `@Input`/`@Output` instead of `getElementById`

### 4.3 `HttpRequestsBuilderAndTesterComponent` (489 → ~2 files)

| Extract | Target File | What Goes There |
|---|---|---|
| `RequestBuilderComponent` | `http-requests-buider-and-tester/request-builder/` | Form: expression, method, args |
| `ResponseViewerComponent` | `http-requests-buider-and-tester/response-viewer/` | Output textarea, status display |

Rename `http-requests-buider-and-tester` → `http-requests-builder-and-tester` (fix typo).

---

## Phase 5 — Feature Module Splitting

**Current**: All 37 components in `main.module.ts` with all jqWidget imports (20+) loaded eagerly.

**Target module structure**:

```
main.module.ts          ← imports SharedModule + lazy feature modules
SharedModule            ← common jqx widgets, utility components, services
FileManagerModule       ← Explorer + Editor + HttpTester (lazy)
SettingsModule          ← Settings + Users + Permissions + Webhooks (lazy)
AuthModule              ← Login + Register + ChangePassword
```

> Note: Angular 5 supports lazy loading via `loadChildren: './path/module#ClassName'`. No syntax changes needed.

---

## Phase 6 — Loading, Empty & Error States

### Loading State
- Current: jqxLoader overlay (functional but visually dated)
- Improvement: keep jqxLoader but style it with `var(--color-bg-secondary)` and a modern spinner

### Empty States
- File tree empty: show a styled empty state with a prompt to create a directory
- Search results empty: clear "No results found" message with icon

### Error States
- HTTP errors currently show a messagebox
- Add a non-blocking notification/toast for non-critical errors
- **File to create**: `misc/toast/toast.component.ts` — simple slide-in notification that auto-dismisses

---

## Phase 7 — Dark Theme Final Polish

After Phases 1–6, do a visual audit of each screen in dark mode:

| Area | Check |
|---|---|
| Header | `--color-header-bg/text` applied |
| File tree panel | `--color-bg-secondary`, tree item colors |
| Editor area | ACE dark theme auto-selected |
| All dialogs | `--color-bg-primary`, labels, inputs |
| Buttons | `--color-accent` for primary, `--color-border` for secondary |
| Icons | SVG or CSS-based; no hard-coded colors |
| Scrollbars (optional) | Custom scrollbar styling via `::webkit-scrollbar` |

ACE editor dark theme auto-select:
```typescript
// When dark theme is active
editor.setTheme('ace/theme/monokai');
// When light theme is active
editor.setTheme('ace/theme/textmate');
```

---

## Phase 8 — Accessibility & Responsive

- Add `aria-label` to icon-only buttons
- Ensure dialog close buttons have accessible labels
- Header: on narrow viewports, collapse main-menu into a hamburger (jqxMenu supports this)
- Splitter panels: persist collapse state in localStorage

---

## Implementation Priority Order

```
1. themes.css + ThemeService + dark/light toggle button     [Phase 1]  ← START HERE
2. Apply CSS variables to global styles + shared classes    [Phase 1]
3. Header redesign                                          [Phase 2]
4. Dialog/form standardization with nx-* classes           [Phase 3]
5. Loading/error/empty states                              [Phase 6]
6. StorageFilesExplorerComponent decomposition             [Phase 4.1]
7. StorageFilesEditorComponent decomposition               [Phase 4.2]
8. HttpRequestsBuilderAndTesterComponent decomposition     [Phase 4.3]
9. Feature module splitting                                [Phase 5]
10. Final dark theme polish + ACE theme sync               [Phase 7]
```

---

## Files to Create (New)

| File | Purpose |
|---|---|
| `frontend/src/themes.css` | CSS custom properties (light/dark tokens + shared utility classes) |
| `frontend/src/app/main/services/theme.service.ts` | Theme init, toggle, localStorage persistence |
| `frontend/src/app/main/services/file-actions.service.ts` | Extracted file operation API calls |
| `frontend/src/app/main/services/file-persistence.service.ts` | Extracted file save/load calls |
| `frontend/src/app/main/services/tab-state.service.ts` | Extracted tab open/close/restore logic |
| `frontend/src/app/main/misc/toast/toast.component.*` | Non-blocking notification component |
| `frontend/src/app/main/filemanager/storage-files-editor/ace-editor-wrapper/ace-editor-wrapper.component.*` | ACE editor encapsulation |

## Files to Modify (Key)

| File | Change |
|---|---|
| `frontend/src/styles.css` | Add CSS variable usage, dark-mode-aware overrides |
| `frontend/src/index.html` | Add `data-theme` attribute on `<html>` |
| `frontend/src/main.ts` | Call `ThemeService.init()` before bootstrap |
| `frontend/src/app/main/services/appearance.service.ts` | Sync jqWidgets theme selection with ThemeService |
| `frontend/angular.json` | Add `themes.css` to styles array |
| All 20 component CSS files | Replace repeated patterns with `nx-*` classes |
| `frontend/src/app/main/header/auth-menu/auth-menu.component.*` | Add theme toggle button |
| `frontend/src/app/main/main.module.ts` | Import new services, register ThemeService |
