Nexl-Server JS — Repository Instructions

Project context
- This repository is Nexl-Server JS.
- It includes an Angular frontend and a Node.js backend.
- The project includes a custom language for expressions that reads files and produces JSON/XML outputs.
- The main refactoring focus is usually on the UI side, making it cleaner, more modern, and supporting a dark theme.
- A secondary functional area is persistence/versioning for saved data and files.
- Existing behavior is important and should be preserved unless a change is explicitly requested.

General working principles
- Always start by understanding the relevant code path before making changes.
- Scan broadly enough to understand the feature, dependencies, shared components/services, backend endpoints, and side effects before editing.
- Prefer minimal, safe, reversible changes over broad rewrites.
- Preserve current behavior unless the task explicitly asks to change it.
- Keep compatibility with the existing project structure, conventions, and dependencies.
- If the codebase already has a clear pattern, follow it instead of introducing a new architecture unnecessarily.

Core constraints
- Do not upgrade Angular, Node.js, or other libraries by default.
- Consider version or dependency changes only with care, and only when clearly necessary.
- Prefer implementation approaches that work with the current stack.
- Do not rewrite the custom expression engine unless explicitly asked.
- Do not introduce breaking API changes unless explicitly requested.
- Do not run tests unless explicitly asked.
- Do not create tests unless explicitly asked.
- Do not generate Markdown files, documentation files, or general docs unless explicitly asked.

Project scanning expectations
- Before changing code, inspect the relevant areas thoroughly.
- Identify:
  - Angular feature/module/component structure
  - Shared services, directives, pipes, and models
  - Routing and navigation flow
  - Styling/theme approach
  - Backend routes/controllers/services/repositories
  - File parsing and JSON/XML generation flow
  - Persistence or save/load flow if related
- Look for coupling, duplication, oversized components, complex templates, and unsafe cross-layer dependencies.
- Avoid acting on assumptions when the existing implementation can be inspected directly.

Angular development guidance
- Follow Angular style guidance with consistent naming and structure. [web:16]
- Prefer organizing code by feature area when practical, because Angular guidance emphasizes cohesion and maintainability. [web:16]
- Keep components focused on presentation and UI behavior; move business logic and reusable logic into services or helper layers when appropriate. [web:16]
- Keep template logic simple; if an expression becomes hard to read or maintain, move that logic into TypeScript. [web:16]
- Keep lifecycle hooks and constructors simple; delegate substantial work to well-named methods. [web:19]
- Reuse existing shared building blocks where it improves consistency.
- Split large components carefully when it clearly improves readability or maintainability.
- Avoid unnecessary refactors that only rename/move files without meaningful benefit.

UI and styling guidance
- Favor incremental UI improvement over full redesign unless explicitly requested.
- Aim for a modern, clean, consistent interface with better spacing, hierarchy, states, and readability.
- Prefer semantic design tokens and CSS custom properties for theme-related styling because they scale well for dark mode and reduce risky styling duplication. [web:22][web:25]
- Use semantic variable names such as surface, text, border, primary, muted, danger, and accent rather than raw color names. [web:25]
- Prefer a root-level theme switch approach such as a data attribute or root class for dark mode. [web:22][web:25]
- Respect the existing styling approach unless a local refactor is needed for consistency or maintainability.
- Keep accessibility in mind, especially contrast, focus states, and readable interactive states.

Dark theme guidance
- When implementing or extending dark mode, prefer a token-based approach using CSS variables.
- Avoid duplicating component styles unnecessarily when theme tokens can solve the problem centrally.
- Theme behavior should be predictable, maintainable, and compatible with the current Angular version and styling setup.
- If a theme toggle exists or is needed, keep it simple and compatible with current project conventions.

Node.js/backend guidance
- Preserve separation of concerns between HTTP handling, business logic, and persistence where practical.
- Prefer clear layers such as route/controller, service, and persistence/repository when the codebase already supports that style or when introducing new backend logic. [web:21]
- Keep parsing logic, file handling logic, and persistence/versioning logic separate when possible.
- Avoid spreading data access logic across unrelated files.
- Handle failure paths carefully, especially around parsing, file operations, and save flows.

Persistence and versioning guidance
- If implementing save-to-database or versioning features, preserve the current behavior for parsing and output generation.
- Prefer a design where the latest/current state is easy to retrieve and previous revisions are retained cleanly.
- Treat version history as append-only unless explicit restore behavior is requested.
- Avoid destructive overwrite behavior when version history matters.
- Keep the persistence approach compatible with the existing backend style and deployment expectations.

Change discipline
- Make changes only where needed for the task.
- Do not perform unrelated cleanup unless it directly improves the requested work.
- If you notice a larger issue, mention it briefly in the response, but do not refactor it unless asked.
- Prefer small, logically grouped edits.
- Preserve backward compatibility wherever possible.

Output expectations
- By default, provide the code changes only.
- Do not create documentation, markdown reports, migration notes, or design docs unless explicitly requested.
- Do not add or run tests unless explicitly requested.
- Keep explanations concise and practical.
- When relevant, mention assumptions, risks, or optional follow-up items in plain text within the response rather than creating files.

When uncertain
- Inspect more before changing code.
- Choose the safer option.
- Ask for clarification if the task would otherwise require a risky assumption.
- Default to compatibility, minimalism, and maintainability.
