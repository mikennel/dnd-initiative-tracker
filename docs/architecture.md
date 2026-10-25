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

## Further reading
- [Domain model](domain-model.md)
- [DDB API notes](ddb-api.md)
- [Decisions](decisions/)
