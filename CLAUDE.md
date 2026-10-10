# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Browser Permission Radar** is a client-side tool that visualizes the permission states the page itself can see (12 permissions: geolocation, camera, microphone, MIDI, clipboard read/write, persistent storage, background sync, notifications, push, payment handler, idle detection) as category radar charts with scores, safe permission tests, and live updates via `PermissionStatus` `change` events.

This is Day092 of the "100 Security Tools with Generative AI" project, focused on browser security education.

Important framing: the Permissions API only reports the state for the querying page's top-level origin. The tool cannot see permissions granted to other sites.

## Running the Application

Static HTML/CSS/JavaScript with ES modules, no build step.

- Serve over HTTP (ES modules do not load from `file://` in Chrome/Edge): `python -m http.server 8000` → open `http://localhost:8000/`
- Demo: https://ipusiron.github.io/browser-permission-radar/
- Tests: `npm test` (Node.js 22+, `node --test`, no dependencies). GitHub Actions runs it on push and pull_request.

## Architecture

| File | Role | Uses DOM |
|---|---|---|
| `js/perm-core.js` | Permission definitions (`PERMISSIONS`, `GROUPS`), state classification (`classify`), scoring (`SCORE_TABLE`, `groupScore`, `summarize`) | No |
| `js/scanner.js` | Querying (`queryOne`, `scanAll`) with browser APIs injected via `env`, feature detection, result diffs | No |
| `js/radar-geom.js` | Radar geometry (axes, points, label boxes that never overlap points) | No |
| `js/radar-svg.js` | Renders the radar as SVG (`renderRadar`); points are `role="button"` | Yes |
| `js/messages.js`, `js/i18n.js` | UI/log strings and `t(key, params)` | No |
| `script.js` | UI glue: tabs, details table, tooltips, quick tests, live updates | Yes |
| `sw.js` | Service Worker registered only when the Background Sync test is pressed (no fetch handler, no network) | - |

### States

- `granted` / `prompt` / `denied`: returned by `navigator.permissions.query()`
- `unknown`: the query was rejected (TypeError etc.) but the feature API exists → not scored
- `unsupported`: the feature API does not exist → score 0
- Notifications: `Notification.permission` is also read; `"default"` maps to `prompt`. A mismatch with the query is shown in the details table.
- Scores: granted 1.0, prompt 0.5, denied 0.1, unsupported 0.0, unknown excluded from the category average ("n of 4 measured").

### Adding a permission

1. Add an entry to `PERMISSIONS` in `js/perm-core.js` (key, group, descriptor, feature).
2. If it uses a new feature API, add detection in `detectFeatures()` (`js/scanner.js`).
3. Add `perm.<key>.desc` and `perm.<key>.risk` to `js/messages.js`.
4. Optionally add a test button in `index.html` and an entry in `QUICK_TESTS` in `script.js`.
5. Update README (category table, directory tree) and run `npm test`.

## Security & Privacy Principles

- No data transmission (`connect-src 'none'`); no external libraries or CDNs
- CSP without `'unsafe-inline'`: no `style` attributes or inline handlers; set positions via CSSOM only
- Build tables with `createElement` + `textContent` (no `innerHTML` with dynamic data)
- Permission requests and Service Worker registration only on explicit button presses; camera/mic stopped immediately; coordinates and clipboard contents never displayed
- Do not reintroduce frame-busting (`window.top.location = …`): it throws in Chromium cross-origin iframes and stops the whole script. When framed, the page shows a notice instead.

## Conventions

- Indentation: 2 spaces; UTF-8; LF line endings (checked by `test/format.test.js`)
- Lines ≤ 160 chars in JS/CSS, ≤ 250 in `index.html`
- Japanese text: no spaces between Japanese and ASCII; long vowel forms (ブラウザー, リポジトリー); body text in です・ます, bullet lists in である
- README numbers are recomputed from `test/fixtures/measured-20261010.json` by `test/readme.test.js`

## Educational Context

Pairs with [Browser Fingerprint Mirror (Day077)](https://github.com/ipusiron/browser-fingerprint-mirror):
- Permission Radar: what a site may access after the user allows it (and what is granted without asking)
- Fingerprint Mirror: what a browser reveals without any permission
- Querying permission states itself requires no user action, so the states are part of the passive surface too.
