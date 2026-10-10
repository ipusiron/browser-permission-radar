# Repository Guidelines

## Project Structure & Module Organization
- Root files: `index.html`, `style.css`, `script.js` (UI glue, ES module), `sw.js` (Service Worker used only by the Background Sync test).
- `js/`: pure modules (`perm-core.js`, `scanner.js`, `radar-geom.js`, `messages.js`, `i18n.js`) and the SVG renderer (`radar-svg.js`).
- `test/`: `node --test` suites and `fixtures/` (measured permission states).
- Docs: `README.md`, `TECHNICAL.md`, `PERMISSIONS_API.md`, `CLAUDE.md`, `LICENSE` (MIT).

## Build, Test, and Development Commands
- Serve locally (secure context and ES modules need HTTP): `python -m http.server 8080` → open `http://localhost:8080`.
- Run tests: `npm test` (Node.js 22+, no dependencies). CI runs the same on push and pull_request.
- No build step. GitHub Pages serves the repository root.

## Coding Style & Naming Conventions
- Indentation: 2 spaces; UTF-8; LF line endings.
- HTML: semantic elements; classes in kebab-case (e.g., `score-link`); ids follow the existing camelCase pattern (e.g., `radarDevice`).
- JS: ES modules; `const`/`let`; functions lowerCamelCase; constants UPPER_SNAKE. Keep DOM-free logic in `js/` so it stays testable.
- UI strings go to `js/messages.js` and are read with `t()`.
- No external runtime dependencies, no CDN, no inline styles or handlers (CSP has no `'unsafe-inline'`).

## Testing Guidelines
- Add or update tests in `test/` for any logic change; do not change expected values to make tests pass.
- Manual: run locally and check the quick tests, live updates (change a permission from the address bar), and the details table in Chrome/Edge and Firefox.

## Commit & Pull Request Guidelines
- Commit messages may be in Japanese; keep the first line short.
- PRs should include a description, before/after screenshots for UI changes, and notes on browser testing.

## Security & Configuration Tips
- Many permissions require a secure context (HTTPS or `localhost`).
- Request permissions only on explicit user action; handle `unknown` and `unsupported` without guessing.
- Do not add analytics or send any data. Keep logs local and never show coordinates or clipboard contents.

## Extending the Radar
- To add a permission: add it to `PERMISSIONS` in `js/perm-core.js`, its strings to `js/messages.js`, and feature detection to `js/scanner.js` if needed. The radar and table render it automatically.
