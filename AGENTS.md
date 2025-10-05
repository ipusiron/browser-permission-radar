# Repository Guidelines

## Project Structure & Module Organization
- Root files: `index.html`, `style.css`, `script.js`.
- Docs: `README.md` (project overview), `LICENSE` (MIT). Optional agent notes may appear in files like `CLAUDE.md`.
- Static site only; no build system or package.json. Keep additions lightweight and client‑side.

## Build, Test, and Development Commands
- Serve locally (secure context needed for many APIs):
  - Python: `python -m http.server 8080` → open `http://localhost:8080`.
  - Node (if installed): `npx http-server -p 8080`.
  - VS Code: “Live Server” extension works as well.
- No build step. Deploy by hosting these static files (GitHub Pages works).

## Coding Style & Naming Conventions
- Indentation: 2 spaces; UTF‑8; LF/CRLF as per OS is fine.
- HTML: semantic where possible; classes in kebab-case (e.g., `score-link`), ids follow existing camelCase pattern (e.g., `radarDevice`).
- JS: ES2015+; prefer `const`/`let`; functions in lowerCamelCase; constants UPPER_SNAKE.
- Keep `script.js` modular: group helpers (scanning, scoring, rendering) and avoid global leaks (IIFE pattern already used).
- No external runtime deps; avoid adding frameworks unless discussed.

## Testing Guidelines
- Manual: run locally, verify Quick Tests buttons (Notifications, Geolocation, Camera/Mic, Clipboard, MIDI, Persistent Storage) and that scores/radars/tables update.
- Cross‑browser check: latest Chrome, Firefox, Edge; test normal + private windows.
- Optional automation: if added, place tests in `tests/` and document how to run them in `README.md`.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
- PRs should include: concise description, rationale, before/after screenshot or short clip for UI changes, and notes on browser testing.

## Security & Configuration Tips
- Many permissions require a secure context (HTTPS or `localhost`).
- Request permissions only on explicit user action; handle `unsupported` gracefully.
- Do not add analytics/PII collection. Keep logs minimal and local.

## Extending the Radar
- To add a permission: update `PERMS` and assign it to a group in `GROUPS` in `script.js`; labels render automatically. Keep the UI text and legends in sync.
