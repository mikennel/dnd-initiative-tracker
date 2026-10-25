# 0003: PCs are read-only mirrors of DDB; monsters are local

- Status: accepted
- Date: 2026-10-25

## Context
Players manage their own sheets on DDB during play (damage, temp HP, slots, conditions).
The DM wants to *see* those changes in the tracker. The DM explicitly does **not** want the
app to modify player sheets. Monster state has no source of truth outside the tracker.

## Decision
- The app never issues write requests to DDB. The DDB client only implements GETs, plus the
  token POST and POSTs to an explicit allowlist of **read-only query** endpoints
  (`READ_ONLY_POSTS` in `apps/server/src/ddb/client.ts`). Those take their parameters in the
  body and change nothing. Today the list is just the scds character summaries (amended
  2026-10-25, see below).
- PC combatants linked to a DDB character (`source.ddbCharacterId`) show HP, temp HP,
  conditions, death saves and spell slots from the last poll of the character service. The
  tracker disables the HP controls for them.
- The DM may add **local overlays** to PCs that don't exist on the sheet: tracker
  conditions with durations, concentration, notes. These are event-sourced like everything else.
- Monsters, NPCs and environment effects are fully local and event-sourced.
- PCs added manually (no DDB link) are local and behave like NPCs.

## Amendment (2026-10-25): read-only POST queries
DDB's `character-service-scds/v2/characters` returns DDB-computed AC, initiative bonus, HP,
conditions and passives for a whole party in one request. It is a POST only because the
character id list goes in the body. Recomputing AC and initiative ourselves would mean
re-implementing DDB's rules engine (armor, shields, Unarmored Defense, feats, magic items), and
asking the DM to type them in wouldn't happen in practice. So the rule is "read-only requests
only", not "GET only". Any new POST endpoint must be added to the allowlist on purpose and
documented in `docs/ddb-api.md`. The server test asserts that every non-GET request goes to
the token mint or to scds.

## Consequences
- PC HP lags the sheet by up to one poll interval (default 6 s).
- If DDB is unreachable, PCs show their last known values with a "stale" indicator. Combat
  keeps working.
