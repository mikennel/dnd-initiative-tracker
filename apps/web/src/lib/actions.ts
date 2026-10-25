import type { CombatEventBody, Combatant } from '@dnd/core';

/** HP presets relative to the creature's original max HP. ×1 restores it. */
export const HP_SCALES = [1, 1.5, 2] as const;

/** `hp/scaled` for each enemy/NPC with HP; PCs (HP from DDB) are left alone. */
export function scaleHpEvents(combatants: Combatant[], factor: number): CombatEventBody[] {
  return combatants.filter((c) => c.kind !== 'pc' && c.hp).map((c) => ({ type: 'hp/scaled', id: c.id, factor }));
}

/** The multiplier currently applied (1 when never scaled). */
export function hpScale(c: Combatant): number {
  return c.hpBase && c.hp ? Math.round((c.hp.max / c.hpBase) * 100) / 100 : 1;
}
