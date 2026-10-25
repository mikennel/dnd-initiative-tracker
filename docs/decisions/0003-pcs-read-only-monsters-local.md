# 0003: PCs are read-only mirrors of DDB; monsters are local

- Status: accepted
- Date: 2026-10-25

## Context
Players manage their own sheets on DDB during play (damage, temp HP, slots, conditions).
The DM wants to *see* those changes in the tracker. The DM explicitly does **not** want the
app to modify player sheets. Monster state has no source of truth outside the tracker.

## Decision
- The app never issues write requests to DDB. The DDB client only implements GETs, plus the
  token POST.
- PC combatants linked to a DDB character (`source.ddbCharacterId`) show HP, temp HP,
  conditions, death saves and spell slots from the last poll of the character service. The
  tracker disables the HP controls for them.
- The DM may add **local overlays** to PCs that don't exist on the sheet: tracker
  conditions with durations, concentration, notes. These are event-sourced like everything else.
- Monsters, NPCs and environment effects are fully local and event-sourced.
- PCs added manually (no DDB link) are local and behave like NPCs.

## Consequences
- PC HP lags the sheet by up to one poll interval (default 6 s).
- If DDB is unreachable, PCs show their last known values with a "stale" indicator. Combat
  keeps working.
