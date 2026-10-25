# 0002: Event-sourced combat state

- Status: accepted
- Date: 2026-10-25

## Context
The main pain with DDB's tracker is losing HP, initiative and turn state when it crashes
mid-session. We also want unlimited undo, multiple synced screens, and an audit trail.

## Decision
Combat state is never stored directly. Every DM action is an immutable **event**
(`packages/core/src/combat/events.ts`). State is `materialize(events)`, a pure fold in
`reducer.ts`:

- Events are appended to SQLite on the server (`apps/server/src/store/eventStore.ts`) before
  they are acknowledged. Clients also persist pending events in IndexedDB, so a server
  hiccup doesn't lose input.
- Events carry a client-generated `id`. The server dedups by id, so retries are safe.
- **Randomness is resolved before the event is created** (initiative rolls, recharge rolls).
  The reducer is deterministic, so replay always gives the same state.
- Undo and redo are themselves events. `materialize` keeps an undo stack, and any new
  event clears the redo stack.
- Data mirrored from DDB (PC HP, conditions, slots) is **not** event-sourced. It is live
  external state merged at projection time ([ADR 0003](0003-pcs-read-only-monsters-local.md)).

## Consequences
- Crash recovery is "reload the page". The log replays to the exact state.
- Folding the full log on every change is O(n). A combat has at most a few hundred
  events, so this is fine. Add snapshots if it ever matters.
- Changing the shape of an event requires a migration in `materialize`. Prefer adding new
  event types over changing old ones.
