# Architecture

```
 ┌───────────── DM laptop ───────────────────────────────────────────┐
 │                                                                   │
 │  apps/web (Vite/React)            apps/server (Fastify, Node 22)  │
 │  ┌──────────────┐  HTTP + WS      ┌──────────────────────────┐    │        D&D Beyond
 │  │ /dm          │ ◄─────────────► │ /api/combats  (events)   │    │   ┌──────────────────┐
 │  │ /builder     │                 │ /api/ddb/*    (proxy)    │ ──────► auth-service      │
 │  │ /settings    │                 │ /ws           (state)    │    │   │ encounter-service│
 │  └──────────────┘                 │                          │    │   │ monster-service  │
 │                                   │ eventStore ── SQLite     │    │   │ character-service│
 │                                   │ pcPoller ─── every 6 s ──────────► (read only)      │
 └───────────────────────────────────┴──────────────────────────┴────┘   └──────────────────┘
          ▲  LAN (http://<laptop-ip>:5175)
          │
   Tablet / TV: /table  (player-view projection only)
```

## Packages

| Path | Responsibility |
|---|---|
| `packages/core/src/combat` | Domain types, events, the pure reducer, `materialize` (undo/redo), selectors including `playerView` |
| `packages/core/src/ddb` | DDB payload types, `slimConfig`, `mapMonster`, `mapCharacter`, `mapEncounter`, `parseStatBlock` |
| `packages/core/src/encounter` | XP/CR difficulty (2014 and 2024 rules) |
| `packages/core/src/dice.ts` | Dice rolling helpers (randomness lives at the edges, never in the reducer) |
| `apps/server/src/ddb` | `DdbClient` (cookie → token, typed GETs, config cache), the **only** module that talks to DDB |
| `apps/server/src/store` | `node:sqlite` database: `combats`, `events`, `monster_cache`, `kv` |
| `apps/server/src/sync/pcPoller.ts` | Polls DDB characters referenced by active combats and broadcasts `pcLive` updates |
| `apps/server/src/ws.ts` | WebSocket hub: DM channel (full state + events) and table channel (`playerView` only) |
| `apps/web/src/lib/combatClient.ts` | Client sync engine: server events + local pending queue (IndexedDB) → `materialize` |

## Data flow for one DM action
1. The UI builds an event, e.g. `{type:'hp/damage', id:'m1', amount:12}`, with a fresh `eventId`.
   Any dice are already rolled.
2. `combatClient` applies it optimistically (pending queue, persisted to IndexedDB) and
   sends it over the WebSocket.
3. The server appends it to SQLite (dedup by id), assigns `seq`, and broadcasts it to DM
   clients. It recomputes `playerView` and pushes that to table clients.
4. Clients move the event from pending to confirmed.

A crash anywhere loses at most an unsent pending event, and that survives in IndexedDB too.

## State composition
```
CombatState = materialize(events)          // event-sourced, local truth (ADR 0002)
PcLive      = Map<ddbCharacterId, PcSnapshot>  // polled from DDB, not event-sourced (ADR 0003)
View        = combine(CombatState, PcLive) // what the UI renders; playerView() for /table
```

## Server API (`apps/server/src/routes.ts`)
| Route | Purpose |
|---|---|
| `GET /api/status` | DDB connection status (`unconfigured`, `ok`, `auth-failed`, `unreachable`), the table's combat id, LAN URLs |
| `PUT /api/settings/ddb` `{cobaltSession}` / `DELETE` | Store the cookie after verifying it mints a token, or forget it |
| `GET /api/ddb/campaigns`, `/campaigns/:id/characters` | Campaign list and roster |
| `GET /api/ddb/encounters?skip&take`, `/encounters/:id` | DDB encounters (raw) |
| `GET /api/ddb/monsters?ids=1,2`, `/monsters/search?q&homebrew=1` | Mapped `MonsterStatBlock`s. Cached in SQLite, and search falls back to the cache when offline |
| `GET /api/ddb/characters/:id` | A `PcSnapshot` |
| `GET/POST /api/combats`, `POST /api/combats/import` `{encounterId, hp}` | List, create, or import a combat |
| `GET/POST /api/combats/:id/events` | The event log, plus an HTTP fallback for appending events (dedup by `eventId`) |
| `PATCH/DELETE /api/combats/:id` | Archive or delete a combat |
| `PUT /api/table` `{combatId}` | Choose what `/table` shows. By default it follows the combat the DM opened last |
| `GET/PUT/DELETE /api/encounters/:id` | Locally saved builder encounters (JSON docs) |

### WebSocket `/ws`
```
client → server  {t:'subscribe', combatId, role:'dm'|'table'}   // combatId 'current' = follow the DM
                 {t:'events', combatId, events}                 // dm only
server → dm      {t:'snapshot', combatId, events, pcLive} · {t:'events', combatId, events}
                 {t:'ack', combatId, eventIds} · {t:'pcLive', combatId, pcLive} · {t:'error', message}
server → table   {t:'table', combatId, view: PlayerView}        // projection only (ADR 0005)
```

## Storage (`apps/server/data/`, gitignored)
- `tracker.db` is SQLite with tables `combats`, `events` (append-only, `UNIQUE(combat_id, event_id)`),
  `monster_cache` (raw DDB monsters, 7-day TTL), `kv` (DDB config cache, last PC snapshots,
  table combat) and `encounters`. Migrations live in `store/db.ts`, versioned by `PRAGMA user_version`.
- `secrets.json` holds the `CobaltSession` cookie. `DDB_COBALT_SESSION` can be set as an env var instead.

## Further reading
- [Domain model](domain-model.md)
- [DDB API notes](ddb-api.md)
- [Decisions](decisions/)
