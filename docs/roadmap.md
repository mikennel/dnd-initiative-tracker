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
- [x] Electron desktop app (Windows installer built locally; macOS via GitHub Actions), ADR 0006
- [x] Chrome connector extension: one-click D&D Beyond login handoff, works with Google sign-in
- [x] Firefox: read the login straight from the profile (no extension); extension also runs in Firefox (ADR 0007)
- [x] App icon: "Hooded DM" (`apps/desktop/build/icon.svg`; also the web favicon)
- [x] Auto-update from GitHub Releases (ADR 0008); first release v0.1.0 published 2026-10-25

## Quality of life (2026-10-25)
- [x] Search all D&D Beyond encounters (loaded once, filtered locally); Previous/Next paging, sorted by name
- [x] Rename and re-picture any combatant (upload, paste or URL; resized to a 128 px JPEG inside the event). The original creature type shows next to a custom name, DM side only
- [x] Row buttons to hide/reveal and remove (a toolbar on the row border, so hovering never reflows rows); multi-select Hide/Reveal, Remove and HP ×1/×1.5/×2 relative to the original max (`hp/scaled`)
- [x] Custom creature tab defaults to Enemy and can add hidden
- [x] Lineup phase between setup and combat: players see only their own order on the table, Alert swaps (feat detected from the sheet), then Start combat reveals enemies
- [x] Dropped the "DDB · Ns ago" sync label from tracker rows (still in the PC panel)

## Later
- Chrome extension "import this page"
- Session log export
- Show players' DDB dice rolls live from the game-log socket (initiative rolls straight into the tracker)
- Dice roller using DDB's `data-dicenotation` spans
- Effect templates (Spirit Guardians, Cloud of Daggers, ...)
