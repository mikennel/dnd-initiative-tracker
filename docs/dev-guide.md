# Dev guide

## Setup
Requires **Node ≥ 22.13** (for the built-in `node:sqlite`).
```
npm install
npm run dev        # server on :5175 and Vite on :5173 (proxying /api and /ws)
```
Open http://localhost:5173. Go to **Settings** and paste your D&D Beyond `CobaltSession` cookie
(the steps are on that page). It is stored in `apps/server/data/secrets.json`. You can set
`DDB_COBALT_SESSION` as an env var instead.

## Running at the table
```
npm run build
npm start          # serves the built app and the API on :5175, bound to 0.0.0.0
```
The console prints LAN URLs. Open `http://<laptop-ip>:5175/table` on the TV or tablet; it
follows whichever combat the DM opened last. Windows may ask to allow Node through the
firewall the first time. Allow it on private networks.

## Desktop app (ADR 0006)
```
npm run dev:desktop    # hot reload inside the Electron window (Vite + server watch + app)
npm run desktop    # builds the web app, bundles apps/desktop and opens it in Electron
npm run dist       # Windows installer → apps/desktop/release/DnD Initiative Tracker Setup x.y.z.exe
```
Installer: `apps/desktop/release/dnd-initiative-tracker-setup-x.y.z.exe`. It is unsigned. Windows shows SmartScreen once: **More info → Run anyway**.
macOS builds come from GitHub Actions (**Actions → Desktop builds → Run workflow**, or push a
`v*` tag); download the `.dmg` from the run's artifacts. macOS blocks the first launch: open
**System Settings → Privacy & Security** and click **Open Anyway**. If it says the app "is
damaged", run `xattr -cr "/Applications/DnD Initiative Tracker.app"` once.

The desktop app keeps its data in the OS app-data folder (**File → Open Data Folder**), not
in `apps/server/data/`. To bring over combats from the npm version, quit the app and copy
`tracker.db` (and `secrets.json` if you like) into that folder.

## Testing the desktop app and updates locally
- **Without installing:** `npm run desktop`, or run `apps/desktop/release/win-unpacked/DnD Initiative Tracker.exe`
  after `npm run dist`. Add `DATA_DIR=<folder>` to keep test data away from your real combats.
- **Installed:** run `apps/desktop/release/dnd-initiative-tracker-setup-x.y.z.exe`.
- **Auto-update without GitHub:** the installed app reads `DND_UPDATE_URL` and uses it in place of GitHub
  Releases. Build a newer version into a separate folder and serve it:
  ```
  cd apps/desktop
  npx electron-builder --publish never -c.extraMetadata.version=0.1.1 -c.directories.output=../../.update-test
  npx http-server ../../.update-test -p 8090
  ```
  Then start the installed (older) app from PowerShell:
  `$env:DND_UPDATE_URL="http://localhost:8090"; & "$env:LOCALAPPDATA\Programs\DnD Initiative Tracker\DnD Initiative Tracker.exe"`.
  It offers the update within a few seconds (or use Help → Check for Updates…). Delete `.update-test/` afterwards.

## App icon
The source is `apps/desktop/build/icon.svg`: the "Hooded DM" concept from the icon design
canvas, on a 1024 canvas with the macOS 824 px tile. After editing it, run
`npm run icon -w @dnd/desktop` to re-render `build/icon.png` with Electron.
electron-builder makes the `.ico` and `.icns` from that PNG. The web favicon is a full-bleed
copy at `apps/web/public/favicon.svg`; update both together.

## Releasing an update (ADR 0008)
```
npm run release -- patch     # or minor / major: bumps apps/desktop, commits, tags vX.Y.Z
git push --follow-tags       # GitHub Actions builds Windows + macOS and publishes the release
```
Installed apps find it within 4 hours, at the next launch, or via **Help → Check for Updates…**.
Windows installs it on restart; macOS shows a download link (unsigned apps can't self-update).

## Connecting D&D Beyond
- **Firefox:** log in at dndbeyond.com in Firefox, then **Settings → Use my Firefox login**.
  No extension needed (ADR 0007).
- **Chrome:** install `apps/extension` once (see its README: `chrome://extensions` →
  Developer mode → Load unpacked). Then use **Settings → Connect with Chrome**. In the desktop
  app this opens Settings in Chrome, where the extension does the work.
- **Anything else:** paste the cookie by hand (Settings, collapsed section).
- `npx web-ext lint --source-dir apps/extension` checks the extension against Firefox's rules.

## Scripts
| Command | What it does |
|---|---|
| `npm test` | Vitest: core (reducer, mappers, parser, difficulty) and server (store, API with mocked DDB) |
| `npm run typecheck` | `tsc` for all three workspaces |
| `npm run dev` | Hot-reloading server and web |
| `npm run build && npm start` | Production build served by the Fastify server |

## Data
`apps/server/data/` (gitignored) holds `tracker.db` (SQLite) and `secrets.json`. Deleting the
folder resets everything. Browsers also keep a per-combat copy of events in IndexedDB
(`dnd-tracker` DB). It is a cache; the server is the source of truth.

## Testing against real DDB data
Tests use synthetic fixtures shaped like real payloads (`packages/core/test/fixtures/`). To
inspect a live payload, use the running server: e.g. `curl localhost:5175/api/ddb/monsters?ids=5194923`
or `/api/ddb/characters/<id>`. Don't commit real character payloads; they contain other
players' data.

## Resilience check (do this after touching sync code)
1. Start a combat, deal some damage, add a condition.
2. Kill the server process. The header shows *Offline*.
3. Keep making changes ("N unsynced"), then reload the page. The state is still there.
4. Restart the server. The header returns to *Saved* and `/table` catches up.

## Conventions
See `CLAUDE.md`: keep the wiki current, make small conventional commits, never write to DDB,
and keep the reducer pure.
