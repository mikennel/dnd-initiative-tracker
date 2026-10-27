# Domain model

All of this lives in `packages/core/src/combat/`. It is pure TypeScript with no I/O.

## CombatState
```
CombatState {
  id, name, campaign, sourceEncounterId
  combatants: Record<id, Combatant>
  started, round, activeId          // whose turn it is (by id, not index, so inserts are safe)
  prompts: CombatPrompt[]           // things the DM should resolve (saves, recharge rolls...)
  settings { showMonsterHealth, effects, skipDefeated, rules: '2014'|'2024' }
  statBlocks: Record<key, MonsterStatBlock>   // key = DDB monster id
  log: { round, text }[]            // human-readable history (last 300)
}
```

## Combatant
| Field | Notes |
|---|---|
| `kind` | `pc`, `monster`, `npc`, or `effect` (lair actions, hazards, spell zones) |
| `initiative`, `initBonus`, `dex`, `order` | Sort keys, in that order (`order.ts`). For DDB-linked PCs, rolling uses the sheet's bonus (`effectiveInitBonus`); the tiebreak still uses the local `initBonus` because the reducer can't see polled data |
| `hp` | `{current,max,temp}`, or `null` for DDB-linked PCs (HP comes from `PcSnapshot`, ADR 0003) |
| `ac` | Number, or `null`. For DDB-linked PCs it stays `null` and the UI shows the sheet's AC (`effectiveAc`). A value set by the DM overrides the sheet (e.g. Shield) |
| `conditions[]` | See below |
| `concentration` | Spell name, or null |
| `resources[]` | See below |
| `hidden` | Excluded from the player view entirely, but still takes turns. Revealing it makes it appear on `/table` in its initiative slot |
| `hpBase` | Original max HP, set the first time `hp/scaled` runs. ×1.5/×2 multiply this, never the current max. ×1 restores it and clears the field, and a hand-edited max (`hp/set` with `max`) also clears it |
| `avatarUrl` | Picture URL, or a small JPEG data URL from an upload. `''` means no picture |
| `group` | The original creature type ("Beholder"). Shown next to a custom name on the DM side only |
| `defeated` | Set automatically when a monster or NPC hits 0 HP. Skipped in turn order if `settings.skipDefeated` |
| `source` | `{ddbMonsterId}` or `{ddbCharacterId}` |
| `roundsRemaining` | Effects only. Decremented at the start of the effect's turn, and prompts at 0 |

## Conditions and durations
`CombatCondition { id, key, name, level?, sourceId?, duration, note? }`. `key` is a standard
condition (`conditions.ts`), a quick effect (Sapped, Slowed, Blessed...), or `custom`.

| Duration | Semantics |
|---|---|
| `{kind:'rounds', rounds, tick:'start'\|'end', anchorId}` | Decrements at the start or end of **anchorId's** turn; removed at 0. If added during the anchor's own turn with `tick:'end'`, the current turn's end doesn't count. "Until the end of your next turn" is `rounds:1, tick:'end', anchorId: you`. |
| `{kind:'saveEnds', ability, dc, tick}` | Prompts a save at the start or end of the affected creature's own turn |
| `{kind:'manual'}` | Stays until removed |

Adding Incapacitated, Paralyzed, Petrified, Stunned or Unconscious automatically ends concentration.

## Resources
| Kind | Fields | Behaviour |
|---|---|---|
| `recharge` | `min` (5 for "Recharge 5–6"), `charged`, `lastRoll` | When uncharged, a recharge prompt appears at the start of the creature's turn. The client rolls the d6 and sends `resource/recharge` |
| `uses` | `max`, `used`, `reset` | `reset:'turnStart'` (legendary actions) zeroes at the start of the creature's turn |
| `slots` | `slots[{level,max,used}]` | Monster spell slots (legacy stat blocks) |

## Events
Defined in `events.ts`. Every event has `eventId` (client uuid), `ts`, an optional server `seq`, and a `body`.

| Group | Types |
|---|---|
| Combat | `combat/created`, `combat/renamed`, `combat/settings`, `combat/started`, `combat/ended` |
| Combatants | `combatant/added` (optionally carrying a `statBlock`), `combatant/removed`, `combatant/updated`, `statblock/added` |
| Turn | `initiative/set`, `turn/next`, `turn/prev`, `turn/set` |
| HP | `hp/damage` (temp first; concentration prompt; auto-defeat), `hp/heal`, `hp/temp` (sets the value), `hp/set` |
| Conditions | `condition/added`, `condition/removed`, `concentration/set` |
| Resources | `resource/added`, `resource/removed`, `resource/used`, `resource/slotUsed`, `resource/recharge` |
| Meta | `prompt/dismissed`, `batch` (one undo step), `undo`, `redo` |

`turn/next` on a combat that hasn't started starts it. At each boundary: end-of-turn ticks
for the outgoing creature, then the round increments if the order wraps, then start-of-turn
ticks for the incoming one (reset turn-start uses, recharge prompts, effect countdown,
condition ticks).

## Prompts
Prompts are generated deterministically by the reducer. Their ids derive from the event id.
They stay until dismissed or resolved. Recharge prompts clear when the turn moves on.
Kinds: `concentration`, `recharge`, `save`, `effect`.

## Player view
`selectors.ts → playerView(state, pcLive)`. See [ADR 0005](decisions/0005-player-view-projection.md).

## PcSnapshot (polled, not event-sourced)
Live PC state from DDB (ADR 0003), built by `mapCharacterSummary` (scds) and `mapCharacter`
(v5 sheet) and merged by `mergePcSnapshot`:
- `hp`, `conditions` (by name, Exhaustion with level), `deathSaves`: newest source wins.
- `spellSlots`, `pactSlots`, `limitedUses`: v5 sheet only.
- `stats` (scds only, optional): `ac`, `initBonus`, `proficiencyBonus`, `passive{perception,
  insight, investigation}`, `saves{str..cha}`, `spellcasting[]{dc, attack, sources}`, `speeds`,
  `senses`, `resistances`, `immunities`, `vulnerabilities`, `classes`, `race`, `inspiration`.

## Combat phases
`combatPhase(state)` (`selectors.ts`): **setup** → **lineup** → **active**.
- **setup**: the DM builds the fight and rolls. `/table` shows only the players, without numbers.
- **lineup** (`state.lineup`, `combat/lineup {open}`): `/table` shows the players in initiative
  order with their numbers, so anyone with **Alert** (flagged from `PcSnapshot.feats`) can
  swap. Enemies are still hidden from the table.
- **active** (`state.started`): the full tracker. `combat/started` clears `lineup`.
  "Skip lineup" goes straight from setup to active.

`initiative/swapped {a, b}` exchanges two initiative values (the Alert feat's Initiative Swap).
On a tied roll that would change nothing, so the one that was second gets `tiebreak: 1`.
`compareInitiative` checks `tiebreak` right after initiative, and `initiative/set` clears it.
