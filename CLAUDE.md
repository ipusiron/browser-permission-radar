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
- `script.js` - Core logic (~380 lines, IIFE pattern)
- `style.css` - Styling with CSS custom properties and dark mode support

### Core Components (script.js)

**Permission Categories** (lines 52-56):
- `device`: camera, microphone, geolocation, midi
- `data`: clipboard-read, clipboard-write, persistent-storage, background-sync
- `comm`: notifications

**Data Flow**:
1. `scanAllPermissions()` (lines 96-104) - Queries all permissions using Permissions API
2. `queryPermission()` / `featureFallback()` (lines 73-94) - Handles browser compatibility
3. `drawRadarGroup()` (lines 176-242) - Renders category-specific radar charts on canvas
4. `renderTable()` (lines 130-156) - Displays detailed permission table

**Interactive Features**:
- **Radar point clicks** (lines 247-270): Click points on radar → jump to Details tab and highlight row
- **Score links** (lines 273-284): Click category score → filter Details tab by category
- **Category filters** (lines 158-166): Chip buttons to filter Details table
- **Safe permission tests** (lines 292-358): Minimal permission request buttons with auto-cleanup

**Scoring System** (lines 107-113):
- `granted`: 1.0
- `prompt`: 0.5
- `denied`: 0.1
- `unsupported`: 0.0

### Canvas Rendering Details

Radar charts use HTML5 Canvas (lines 176-242):
- Draws concentric circles (0.25, 0.5, 0.75, 1.0 scale)
- Plots polygon based on permission scores
- Stores click maps for hit detection (`clickMaps` object at line 174)
- Uses CSS custom properties for colors (--granted, --prompt, --denied, --unsupported)

### Browser API Integration

The tool uses modern browser APIs with fallback detection:
- **Permissions API**: `navigator.permissions.query()` (line 76)
- **Notifications**: `Notification.requestPermission()` (line 296)
- **Geolocation**: `navigator.geolocation.getCurrentPosition()` (line 304)
- **Media Devices**: `navigator.mediaDevices.getUserMedia()` (line 314)
- **Clipboard**: `navigator.clipboard.readText()` / `writeText()` (lines 325, 334)
- **MIDI**: `navigator.requestMIDIAccess()` (line 343)
- **Storage**: `navigator.storage.persist()` (line 354)

All permission tests immediately clean up resources (e.g., `stream.getTracks().forEach(t => t.stop())` at line 316).

## Development Guidelines

### Modifying Permissions List

To add new permissions, update two locations:
1. Add to appropriate category in `GROUPS` object (script.js:52-56)
2. Add entry to `PERMS` array (script.js:58-68)
3. Optional: Add fallback detection in `featureFallback()` (script.js:82-94)
4. Optional: Add test button and handler (script.js:292-358)

### Styling

CSS uses custom properties for theming (style.css:1-24):
- Light/dark mode support via `@media (prefers-color-scheme: dark)`
- Color variables: `--granted`, `--prompt`, `--denied`, `--unsupported`, `--highlight`
- Responsive grid: 3 columns → 2 columns (≤1200px) → 1 column (≤860px)

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
