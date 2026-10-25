# Roadmap

## Phase 0: DDB endpoint spike ✅
- [x] Auth flow (cookie → cobalt token, TTL 300 s)
- [x] Encounter get and list, monster get, search and homebrew, campaign roster, character sheet
- [x] Character HP formula verified against DDB's tracker
- [x] Public config endpoint for lookup tables
- [ ] Game-log websocket for live sheet updates (polling is used meanwhile)

## Phase 1: Core and server foundation
- [x] Core domain types, events, reducer, `materialize` with undo/redo
- [x] DDB mappers and stat block parser
- [x] Server: DDB client, SQLite event store, WebSocket hub, settings

## Phase 2: DM tracker (MVP)
- [x] Import a DDB encounter (URL, id, or pick from list), not yet verified against live DDB
- [x] Initiative rolling, turn and round controls, undo/redo
- [x] Damage, heal and temp HP (multi-target); conditions with durations; concentration checks
- [x] Recharge, x/day, legendary actions and spell slot trackers; stat block panel with clickable dice
- [x] Add a monster, NPC or environment/lair effect mid-combat

## Phase 3: Live PC sync
- [x] Poll campaign PCs; show HP, temp HP, conditions, death saves and slots with staleness (built, not yet verified against live DDB)

## Phase 4: Player view
- [x] `/table` projection over its own WS channel; hidden and HP-descriptor rules

## Phase 5: Encounter builder
- [x] Campaign-aware party, monster search, 2014 and 2024 difficulty, local saved encounters, run as a combat

## Next up
- [ ] Verify import, PC sync and monster search against live DDB once the cookie is connected
- [ ] PC AC and initiative bonus from the character sheet (currently entered manually)
- [ ] Investigate the game-log websocket so PC updates arrive instantly instead of by polling
- [ ] Rest buttons (short/long rest resets resources)

## Later
- Chrome extension "import this page"
- Session log export
- Dice roller using DDB's `data-dicenotation` spans
- Effect templates (Spirit Guardians, Cloud of Daggers, ...)
