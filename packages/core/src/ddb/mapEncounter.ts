import type { CombatEventBody, NewCombatant } from '../combat/events.ts';
import type { Rng } from '../dice.ts';
import { monsterToCombatant } from './mapMonster.ts';
import type { DdbEncounter, MonsterStatBlock } from './types.ts';

export interface EncounterImportOptions {
  hp?: 'average' | 'roll' | 'ddb';
  /** Keep initiative values already rolled on DDB. */
  keepInitiative?: boolean;
  rng?: Rng;
}

export function pcCombatant(p: { id: string | number; name: string; avatarUrl?: string | null; hidden?: boolean; initiative?: number | null }): NewCombatant {
  return {
    id: `pc-${p.id}`,
    kind: 'pc',
    name: p.name,
    initiative: p.initiative ?? null,
    initBonus: 0,
    ac: null,
    hp: null,
    hidden: !!p.hidden,
    defeated: false,
    conditions: [],
    concentration: null,
    resources: [],
    notes: '',
    source: { ddbCharacterId: Number(p.id) },
    avatarUrl: p.avatarUrl ?? undefined,
  };
}

/**
 * Turn a DDB encounter into `combatant/added` events. DDB already expands quantities into
 * individual entries named "X (A)", "X (B)". `statBlocks` is keyed by DDB monster id.
 */
export function encounterToEvents(enc: DdbEncounter, statBlocks: Record<number, MonsterStatBlock>, opts: EncounterImportOptions = {}): CombatEventBody[] {
  const events: CombatEventBody[] = [];
  const seenStatBlocks = new Set<number>();
  for (const p of enc.players ?? []) {
    events.push({ type: 'combatant/added', combatant: pcCombatant({ ...p, initiative: opts.keepInitiative ? p.initiative : null }) });
  }
  for (const m of enc.monsters ?? []) {
    const sb = statBlocks[m.id];
    if (!sb) continue;
    const hpMode = opts.hp ?? 'ddb';
    const hp = hpMode === 'ddb' && m.maximumHitPoints ? m.maximumHitPoints : hpMode === 'roll' ? 'roll' : 'average';
    const combatant = monsterToCombatant(sb, {
      id: m.uniqueId,
      name: m.name,
      hp,
      initiative: opts.keepInitiative ? m.initiative : null,
      rng: opts.rng,
    });
    if (hpMode === 'ddb' && m.currentHitPoints != null && m.maximumHitPoints && combatant.hp) {
      combatant.hp.current = Math.min(m.currentHitPoints, combatant.hp.max);
    }
    const first = !seenStatBlocks.has(m.id);
    seenStatBlocks.add(m.id);
    events.push(first ? { type: 'combatant/added', combatant, statBlock: sb } : { type: 'combatant/added', combatant });
  }
  return events;
}
