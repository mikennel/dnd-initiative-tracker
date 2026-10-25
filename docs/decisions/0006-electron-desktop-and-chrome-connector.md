# 0006: Electron desktop app, and a Chrome extension for the D&D Beyond login

- Status: accepted
- Date: 2026-10-25

## Context
Running the tracker meant installing Node and using `npm start`, and connecting D&D Beyond
meant copying an HttpOnly cookie out of DevTools. The DM wanted a double-click app for
Windows and macOS and a login flow without DevTools. The DM signs in to D&D Beyond with
Google, and Google refuses sign-in inside embedded app browsers (Electron windows included).
So "log in inside the app window" doesn't work.

## Decision
- **Electron shell** (`apps/desktop`). The main process calls the same `startServer()` as the
  CLI (`apps/server/src/start.ts`) and opens a window on `http://localhost:<port>/`. The
  server still listens on the LAN, so `/table` works on other devices. esbuild bundles the
  server and core into one `dist/main.cjs`, and electron-builder ships no `node_modules`.
  Data lives in the OS app-data folder (`%APPDATA%\DnD Initiative Tracker\data`,
  `~/Library/Application Support/DnD Initiative Tracker/data`); `DATA_DIR` overrides it.
  Electron 45 has Node 24, and its built-in `node:sqlite` works, so ADR 0004's storage choice
  stands.
- **Unsigned builds.** Only the DM installs the app (players use `/table` in a browser), so
  the one-time Windows SmartScreen and macOS "Open Anyway" prompts are acceptable. Revisit
  signing (Azure Trusted Signing, Apple Developer ID) if the app is shared more widely.
- **Chrome connector extension** (`apps/extension`, MV3, loaded unpacked). It reads the
  `CobaltSession` cookie, which only an extension with the `cookies` permission can do, and
  hands it to the tracker's Settings page through a content script that runs only on the
  tracker's localhost ports. The desktop app's "Connect with Chrome" button opens
  `/settings?connect=1` in the default browser. If the user isn't logged in, the extension
  opens D&D Beyond's sign-in and the page polls until the cookie appears. Pasting the cookie
  by hand remains as a fallback.
- **Settings endpoints are loopback-only**, because the server listens on the LAN.

## Amendment (2026-10-25): macOS ad-hoc signature
Apple Silicon won't run code that has no signature at all; it reports the app as "damaged".
`apps/desktop/scripts/after-pack.cjs` ad-hoc signs the `.app` (`codesign --sign -`), which is
free and needs no Apple account. Gatekeeper still asks once (**Open Anyway**), as for any app
from an unidentified developer.

## Consequences
- Two install steps the first time: the app, and the extension (Developer mode → Load unpacked).
- The extension must be updated if the tracker's port range changes (5173, 5175–5177).
- Any page on those localhost ports can ask the extension for the cookie. That's acceptable
  for a personal machine; a real store release would need a pairing token.
- macOS builds come from GitHub Actions (`.github/workflows/desktop.yml`), since a Mac app
  can't be built on Windows.
