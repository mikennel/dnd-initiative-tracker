# 0005: Player view is a server-side projection

- Status: accepted
- Date: 2026-10-25

## Context
A TV or tablet facing the players shows initiative order. It must not leak hidden
monsters, exact monster HP, or DM notes. Players can open devtools.

## Decision
The `/table` route subscribes to a **separate WebSocket channel** that only receives
`playerView(state)` (`packages/core/src/combat/selectors.ts`). Hidden information is
filtered **on the server** before it is sent:
- Hidden combatants (`hidden: true`) are omitted entirely.
- Monster and NPC HP is reduced to a descriptor: Unhurt, Hurt, Bloodied (≤ 50%), Down.
  The DM can turn this off per combat (`settings.showMonsterHealth`).
- PC HP is shown exactly (players see it on their sheets anyway).
- Notes, stat blocks, resources and DM prompts are never sent.

## Consequences
- The DM view and player view can't diverge in logic. Both derive from the same state.
- Adding a field to the player view means adding it to `PlayerViewCombatant` on purpose.
