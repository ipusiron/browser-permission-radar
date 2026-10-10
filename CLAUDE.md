# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Browser Permission Radar** is a client-side tool that visualizes the permission states the page itself can see (18 permissions in four categories: device; data; communication & notifications; screen, network & sensors) as radar charts with scores, safe permission tests, live updates via `PermissionStatus` `change` events, a Permissions Policy experiment (Embedding tab), and comparisons with measured browser defaults and exported results (Compare tab). The UI is Japanese/English.

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
| `js/policy-core.js` | Embedding experiment: `allow` builder, probe message validation, comparison | No |
| `js/probe.js` + `probe.html` | Query page placed in a same-origin iframe; posts results to the same-origin parent only | Yes |
| `js/compare-core.js` | Exposure counts, signature, export/import validation, measured `BASELINES` | No |
| `js/messages.js` | UI/log strings, `ja` and `en` with identical keys | No |
| `js/i18n.js` | `t(key, params)`, `pickInitialLang`, `applyI18n` (`data-i18n`, `data-i18n-html`, `data-i18n-attr`) | Partly |
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
3. Add `perm.<key>.desc` and `perm.<key>.risk` to both `ja` and `en` in `js/messages.js`.
4. If it is policy-controlled, add it to `POLICY_FEATURES` in `js/policy-core.js`; update `BASELINES` and the fixture if you re-measure.
5. Optionally add a test button in `index.html` and an entry in `QUICK_TESTS` in `script.js`.
6. Update both READMEs (category table, directory tree) and run `npm test`.

### i18n

- Static text uses `data-i18n` / `data-i18n-html` / `data-i18n-attr`; the HTML default must equal the `ja` value (`test/i18n.test.js`).
- Dynamic messages (log, statuses) are stored as key + params and re-rendered on language change; never store translated strings.

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
