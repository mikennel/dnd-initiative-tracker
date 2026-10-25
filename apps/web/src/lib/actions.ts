import type { CombatEventBody, Combatant } from '@dnd/core';

/** Scale max and current HP (e.g. ×2 for a tougher boss). Temp HP and PCs are left alone. */
export function scaleHpEvents(combatants: Combatant[], factor: number): CombatEventBody[] {
  return combatants
    .filter((c) => c.kind !== 'pc' && c.hp)
    .map((c) => ({ type: 'hp/set', id: c.id, max: Math.max(1, Math.round(c.hp!.max * factor)), current: Math.max(0, Math.round(c.hp!.current * factor)) }));
}

export const HP_SCALES = [1.5, 2] as const;
