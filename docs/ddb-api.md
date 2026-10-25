# D&D Beyond internal API notes

D&D Beyond (DDB) has **no public API**. Its own front-end talks to a set of JSON
services, which we call from the local server using the DM's session. Everything
here was verified against a live logged-in session on 2026-10-25. These are
undocumented endpoints and **may change without notice**. When something breaks,
start here, re-verify in the browser devtools Network tab, and update this page.

> Policy: this app only ever **reads** from DDB. See
> [ADR 0003](decisions/0003-pcs-read-only-monsters-local.md).

## Authentication

| Step | Request | Notes |
|---|---|---|
| 1 | User copies the `CobaltSession` cookie from `www.dndbeyond.com` (DevTools → Application → Cookies) | Long-lived (weeks). HttpOnly, so it can't be read by page JS. |
| 2 | `POST https://auth-service.dndbeyond.com/v1/cobalt-token` with header `Cookie: CobaltSession=<value>` | Returns `{ token, ttl }`. `ttl` was **300 s**. |
| 3 | Every service call: `Authorization: Bearer <token>` | Refresh the token shortly before `ttl` expires, and on any 401. |

`www.dndbeyond.com/api/...` endpoints authenticate with the **cookie** (not the
bearer token). Send both; it doesn't hurt.

CORS: these services only allow DDB origins, so the browser app can't call them
directly. All calls go through `apps/server` ([ADR 0001](decisions/0001-local-server-cookie-auth.md)).

## Endpoints

### Config (public, no auth)
`GET https://www.dndbeyond.com/api/config/json` (~600 KB). Lookup tables that every
other payload references by id:

| Key | Shape | Used for |
|---|---|---|
| `challengeRatings` | `{id, value, xp, proficiencyBonus}` | `monster.challengeRatingId` → CR / XP / PB. (`id` 1 = CR 0, 2 = 1/8, 3 = 1/4, 4 = 1/2, then `id - 4`) |
| `conditions` | `{definition:{id,name,type}}` | Monster condition immunities, character `conditions[].id` (type 2 = Exhaustion, which has levels) |
| `creatureSizes` | `{id,name}` | `monster.sizeId` (2 Tiny … 7 Gargantuan, 10 "Medium or Small") |
| `monsterTypes` | `{id,name}` | `monster.typeId` |
| `damageAdjustments` | `{id,name,type}` | `monster.damageAdjustments[]` ids. **type 1 = resistance, 2 = immunity, 3 = vulnerability** |
| `senses`, `movements`, `stats`, `abilitySkills`, `alignments` | `{id,name,...}` | Stat block rendering |
| `multiClassSpellSlots`, `pactMagicMultiClassSpellSlots` | `number[][]` indexed by caster level | PC spell slot maximums |

The server caches a slimmed copy (`slimConfig()` in `packages/core/src/ddb/config.ts`).
A committed copy lives at `packages/core/test/fixtures/ddb-config.slim.json`.

### Campaigns
| Request | Returns |
|---|---|
| `GET https://www.dndbeyond.com/api/campaign/active-campaigns` | All campaigns the user is in: `data[]{id, name, dmUsername, ...}` |
| `GET https://www.dndbeyond.com/api/campaign/stt/active-campaigns/{campaignId}` | `data{id, name, dmUsername, dmId, playerCount}` |
| `GET https://www.dndbeyond.com/api/campaign/stt/active-short-characters/{campaignId}` | `data[]{id, name, userName, avatarUrl, characterStatus, isAssigned}`: the roster |
| `GET https://api.dndbeyond.com/campaigns/v1/details/{campaignId}` | Seen in network traffic, not yet inspected |

### Encounters
| Request | Returns |
|---|---|
| `GET https://encounter-service.dndbeyond.com/v1/encounters?skip=0&take=20` | `{pagination{total}, data[]}`, the full encounter objects (newest first) |
| `GET https://encounter-service.dndbeyond.com/v1/encounters/{uuid}` | `{data: Encounter}` |

`Encounter` (relevant fields):
```
id, name, campaign{id,name}, inProgress, roundNum, turnNum, versionNumber,
monsters[]{ id (monster id), uniqueId, name ("Setessan Hoplite (A)"), groupId, quantity,
            currentHitPoints, maximumHitPoints, temporaryHitPoints, initiative, index },
groups[], players[]{ id (character id, string), name, level, type: "CHARACTER_TYPE_DDB",
            hidden, initiative, currentHitPoints/maximumHitPoints (always 0, not populated) },
manualEntries[], difficulty, notes, flavorText, description, rewards
```
DDB's tracker PUTs the whole object back to the service on every change. That is the
save that loses state when it crashes. We never write it.

### Monsters
| Request | Returns |
|---|---|
| `GET https://monster-service.dndbeyond.com/v1/Monster?ids=1&ids=2&ids=3` | `{data: Monster[]}`. The parameter must be **repeated**; `ids=1,2,3` returns 400 ("The value '1,2' is not valid"). A single id works either way, which hid this at first. Homebrew ids work without `showHomebrew` |
| `GET https://monster-service.dndbeyond.com/v1/Monster?search=beholder&skip=0&take=20` | Search, including both legacy (2014) and 2024 versions (`isLegacy`) |
| `GET .../v1/Monster?skip=0&take=20&showHomebrew=t&homebrewOnly=true` | The user's homebrew monsters (`isHomebrew: true`) |

Note: `search=...&showHomebrew=t` returned 0 results in testing. Search official and
homebrew separately.

`Monster` (relevant fields):
```
id, name, isLegacy, isHomebrew, isLegendary, isMythic, hasLair, sizeId, typeId, alignmentId,
armorClass, armorClassDescription, averageHitPoints,
hitPointDice{diceCount, diceValue, fixedValue, diceString},
initiativeBonus (total, e.g. 12 for 2024 Beholder), passivePerception, challengeRatingId,
stats[]{statId 1..6, value}, savingThrows[]{statId, bonusModifier}, skills[]{skillId, value (total)},
senses[]{senseId, notes}, movements[]{movementId, speed, notes}, languageDescription,
damageAdjustments: number[], conditionImmunities: number[],
specialTraitsDescription, actionsDescription, bonusActionsDescription, reactionsDescription,
legendaryActionsDescription, mythicActionsDescription, lairDescription   ← HTML strings
avatarUrl, largeAvatarUrl, basicAvatarUrl, url
```

Stat block HTML format: one `<p>` per feature, name in `<em><strong>Name (Recharge 5–6).</strong></em>`.
Dice appear as `<span data-dicenotation="3d6+3" data-rolltype="damage" data-rolldamagetype="Piercing">`.
2024 legendary block starts with `Legendary Action Uses: 3 (4 in Lair).`; legacy uses
`can take 3 legendary actions`. Limited uses appear in names: `(3/Day)`,
`(3/Day, or 4/Day in Lair)`, `(Recharge 5–6)`, `(Recharge after a Short or Long Rest)`.
2024 spellcasting lists `At Will:` / `2/Day Each:` lines. Legacy uses `1st level (4 slots):`.
Parser: `packages/core/src/ddb/parseStatBlock.ts`.

### Characters
`GET https://character-service.dndbeyond.com/character/v5/character/{id}` returns `{data: Character}`.
The DM's token can read every character in their campaign.

HP is **not** stored as a total. Compute it (`packages/core/src/ddb/mapCharacter.ts`):
```
conScore  = stats[CON] + racial/feat "bonus constitution-score" modifiers   (or overrideStats[CON])
maxHp     = overrideHitPoints ?? baseHitPoints + (bonusHitPoints ?? 0)
            + conMod * totalLevel
            + Σ "hit-points-per-level" bonuses * totalLevel
            + Σ "hit-points" bonuses
currentHp = maxHp - removedHitPoints
tempHp    = temporaryHitPoints
```
Item modifiers only count if the item is `equipped` (and `isAttuned` when `definition.canAttune`).
Match `modifier.componentId` to `inventory[].definition.id`. Verified: Taldum 42 base + 5 bonus
+ 5×9 CON + 2×9 (Tough) = 110 max, removed 55 → 55/110, matching DDB's own tracker.

Other useful fields: `conditions[]{id, level}`, `deathSaves{failCount, successCount, isStabilized}`,
`spellSlots[]{level, used, available}` (`available` was 0; compute max from
`classes[].definition.spellRules.levelSpellSlots[level]`, or for multiclass sum
`floor|ceil(level / multiClassSpellSlotDivisor)` (rounding 1 = down, 2 = up) and index
`config.multiClassSpellSlots[casterLevel]`), `pactMagic[]`, `actions.{class,race,feat}[].limitedUse{maxUses, numberUsed}`.

### Character summaries (batch, precomputed): `scds`
`POST https://character-service-scds.dndbeyond.com/v2/characters` with `Authorization: Bearer <token>`
and body `{"characterIds": [..]}`. DDB's own combat tracker uses this to show PCs. It is a
**read-only query**; the POST carries the id list and changes nothing. It is callable from a
`www.dndbeyond.com` page. Verified 2026-10-25 with 7 campaign characters in one request:
```
{ foundCharacters[], queuedIds[], notFoundIds[] }
foundCharacters[]: characterId, name, level, userId, isAssignedToPlayer,
  armorClass (total), initiativeBonus, initiativeScore (10 + bonus),
  passivePerception, passiveInsight, passiveInvestigation, proficiencyBonus,
  hitPointInfo{ maximum, current, temp, removedHp, baseTotalHp, override },
  conditions[]{ name, level }        ← names, not ids; Exhaustion carries a level
  deathSaveInfo{ failCount, successCount },
  castingInfo{ saveDcs[]{value, sources[]}, spellAttacks[], modifiers[] },
  abilities, skills, senses, speeds, resistances, immunities, vulnerabilities,
  classes, race, attacks, attunedItems, inspiration, currentXp, decorations (avatar)
```
Everything here is already computed by DDB (AC, initiative and max HP include items,
feats and class features), so we don't have to re-implement the rules engine. Taldum's
`hitPointInfo` (55/110) matched our own v5-derived calculation. Spell slots and limited-use
actions are **not** included; they still need the v5 sheet. `queuedIds` suggests a cache
that is recomputed on demand: an unknown id came back in `queuedIds`, not `notFoundIds`. Results are
not in request order, so match them by `characterId`. How quickly it reflects a sheet edit is **not yet measured**.
Used by `DdbClient.getCharacterSummaries` → `mapCharacterSummary` (`packages/core/src/ddb/mapCharacterSummary.ts`).

### Live updates: game log (verified, but carries no sheet changes)
DDB's "game log" is a campaign message broker:
- Socket: `wss://game-log-api-live.dndbeyond.com/v1?gameId=<campaignId>&userId=<userId>&stt=<cobalt token>`.
  `userId` is the `nameidentifier` claim in the token JWT. The client sends `ping` and gets `pong`.
- History: `GET https://game-log-rest-live.dndbeyond.com/v1/getmessages?gameId=..&userId=..` (bearer)
  returns `{data[], lastKey}`.
- Message: `{id, dateTime, gameId, userId, source ("Web", "MobileIOS"), entityId (character id),
  eventType, data}`.

Verified 2026-10-25: the socket accepts the DM's token and stays open. But the only event
types published by the current character-sheet app bundle are `dice/roll/pending|fulfilled|rejected`,
`character-sheet/item-shared/fulfilled` and `map/activate/fulfilled`. There is **no
character-update / HP event**, and the history for the campaign contained only dice rolls.
DDB's own combat tracker doesn't listen for sheet changes either. It fetches `scds` once on load.

Conclusion: there is no live feed for HP/conditions. We poll (`apps/server/src/sync/pcPoller.ts`,
6 s). The game log *is* useful for a future feature: showing players' dice rolls (initiative,
attacks, saves) as they happen.
