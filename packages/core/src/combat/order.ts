import type { Combatant, CombatState } from './types.ts';

/** Initiative order: initiative desc (unrolled last), then init bonus, dex, insertion order. */
export function compareInitiative(a: Combatant, b: Combatant): number {
  const ai = a.initiative ?? -Infinity;
  const bi = b.initiative ?? -Infinity;
  if (ai !== bi) return bi - ai;
  if (a.initBonus !== b.initBonus) return b.initBonus - a.initBonus;
  const ad = a.dex ?? 0;
  const bd = b.dex ?? 0;
  if (ad !== bd) return bd - ad;
  return a.order - b.order;
}

export function turnOrder(state: Pick<CombatState, 'combatants'>): Combatant[] {
  return Object.values(state.combatants).sort(compareInitiative);
}

/** Combatants that actually get a turn (defeated monsters are skipped when the setting is on). */
export function activeTurnOrder(state: CombatState): Combatant[] {
  return turnOrder(state).filter(
    (c) => !(state.settings.skipDefeated && c.defeated && c.kind !== 'pc') || c.id === state.activeId,
  );
}
