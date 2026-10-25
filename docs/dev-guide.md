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
