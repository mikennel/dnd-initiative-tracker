# Roadmap

## Phase 0: DDB endpoint spike ✅
- [x] Auth flow (cookie → cobalt token, TTL 300 s)
- [x] Encounter get and list, monster get, search and homebrew, campaign roster, character sheet
- [x] Character HP formula verified against DDB's tracker
- [x] Public config endpoint for lookup tables
- [x] Game-log websocket investigated: it exists but carries only dice rolls, not sheet changes (polling stays)

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
- [x] PC AC, initiative bonus, passives, saves, spell DC, senses and defenses from the `scds` batch endpoint (ADR 0003 amended for read-only POST queries)
- [x] Poll PCs with one `scds` request; v5 sheets every 30 s for spell slots and limited uses
- [ ] Measure how quickly scds reflects a sheet edit (needs a player to change something)
- [ ] Electron desktop app with in-app D&D Beyond sign-in (see plan)

## Later
- Chrome extension "import this page"
- Session log export
- Show players' DDB dice rolls live from the game-log socket (initiative rolls straight into the tracker)
- Dice roller using DDB's `data-dicenotation` spans
- Effect templates (Spirit Guardians, Cloud of Daggers, ...)
