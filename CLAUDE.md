# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Browser Permission Radar** is a client-side browser permission visualization tool that displays browser permission states (geolocation, camera, microphone, notifications, clipboard, etc.) using category-based radar charts with interactive scoring and safe permission testing capabilities.

This is Day092 of the "100 Security Tools with Generative AI" project, focused on browser security education.

## Running the Application

This is a static HTML/CSS/JavaScript application with no build process:

- **Local development**: Open `index.html` directly in a browser, or use a local server:
  - `python -m http.server 8000` (Python 3)
  - `python -m SimpleHTTPServer 8000` (Python 2)
- **Demo**: https://ipusiron.github.io/browser-permission-radar/
- **No dependencies**: Zero external libraries, runs entirely in the browser

## Architecture

### File Structure

- `index.html` - Main page structure with 3 tabs (Radar, Details, Learn)
- `script.js` - Core logic (~755 lines, IIFE pattern)
- `style.css` - Styling with CSS custom properties and dark mode support

### Core Components (script.js)

**Permission Categories** (lines 222-226):
- `device`: camera, microphone, geolocation, midi
- `data`: clipboard-read, clipboard-write, persistent-storage, background-sync
- `comm`: notifications, push, payment-handler, idle-detection

**Data Flow**:
1. `scanAllPermissions()` (lines 273-289) - Queries all permissions using Permissions API
2. `queryPermission()` / `featureFallback()` (lines 247-272) - Handles browser compatibility
3. `drawRadarGroup()` (lines 396-559) - Renders category-specific radar charts on canvas
4. `renderTable()` (lines 323-363) - Displays detailed permission table

**Interactive Features**:
- **Radar point clicks** (lines 564-589): Click points on radar → jump to Details tab and highlight row
- **Score links** (lines 592-603): Click category score → filter Details tab by category
- **Category filters** (lines 365-377): Chip buttons to filter Details table
- **Safe permission tests** (lines 623-709): Minimal permission request buttons with auto-cleanup
- **Tooltip system** (lines 94-196): Smart positioning tooltips for permission descriptions

**Scoring System** (lines 300-307):
- `granted`: 1.0
- `prompt`: 0.5
- `denied`: 0.1
- `unsupported`: 0.0

### Canvas Rendering Details

Radar charts use HTML5 Canvas (lines 396-559):
- Draws concentric circles (0.25, 0.5, 0.75, 1.0 scale)
- Plots polygon based on permission scores
- Stores click maps for hit detection (`clickMaps` object at line 387)
- Uses CSS custom properties for colors (--granted, --prompt, --denied, --unsupported)
- Floating label callouts with cyberpunk styling (lines 463-535)

### Browser API Integration

The tool uses modern browser APIs with fallback detection:
- **Permissions API**: `navigator.permissions.query()` (line 250)
- **Notifications**: `Notification.requestPermission()` (line 626)
- **Geolocation**: `navigator.geolocation.getCurrentPosition()` (line 634)
- **Media Devices**: `navigator.mediaDevices.getUserMedia()` (lines 644, 655)
- **Clipboard**: `navigator.clipboard.readText()` / `writeText()` (lines 666, 675)
- **MIDI**: `navigator.requestMIDIAccess()` (line 684)
- **Storage**: `navigator.storage.persist()` (line 695)
- **Background Sync**: `registration.sync.register()` (line 705)

All permission tests immediately clean up resources (e.g., `stream.getTracks().forEach(t => t.stop())` at lines 646, 657).

## Development Guidelines

### Local Development

Serve locally (secure context needed for many APIs):
- Python: `python -m http.server 8080` → open `http://localhost:8080`
- Node: `npx http-server -p 8080`
- VS Code: "Live Server" extension

Note: `file://` protocol will not work - permissions require `localhost` or HTTPS.

### Coding Conventions

- Indentation: 2 spaces; UTF-8
- HTML classes: kebab-case (e.g., `score-link`); IDs: camelCase (e.g., `radarDevice`)
- JS: ES2015+; `const`/`let`; functions lowerCamelCase; constants UPPER_SNAKE
- Keep IIFE pattern; avoid global leaks; no external runtime dependencies

### Modifying Permissions List

To add new permissions:
1. Add to appropriate category in `GROUPS` object (script.js:222-226)
2. Add entry to `PERMS` array with key, descriptor, and desc (script.js:229-242)
3. Optional: Add fallback detection in `featureFallback()` (script.js:256-272)
4. Optional: Add test button in index.html and handler in script.js (lines 623-709)

### Styling

CSS uses custom properties for theming:
- Light/dark mode support via `@media (prefers-color-scheme: dark)`
- Color variables: `--granted`, `--prompt`, `--denied`, `--unsupported`, `--highlight`
- Responsive grid: 3 columns → 2 columns (≤1200px) → 1 column (≤860px)

### Testing

- Manual: Run locally, verify Quick Tests buttons and that scores/radars/tables update
- Cross-browser: Test Chrome, Firefox, Edge; normal + private windows
- Many permissions behave differently in private/incognito mode

### Security & Privacy Principles

This tool is designed for **defensive security education only**:
- **No data transmission**: All processing happens client-side
- **Safe permission tests**: Minimal scope, immediate cleanup
- **User control**: All permission requests require explicit user interaction
- **No persistence**: No LocalStorage, cookies, or server communication

## Educational Context

This tool pairs with [Browser Fingerprint Mirror (Day077)](https://github.com/ipusiron/browser-fingerprint-mirror):
- **Permission Radar**: Active consent layer (what users explicitly allow)
- **Fingerprint Mirror**: Passive exposure layer (what browsers automatically reveal)

Together they illustrate the two-layer structure of browser identification:
- Passive information (environment fingerprints) + Active permissions = Complete browser identification surface
