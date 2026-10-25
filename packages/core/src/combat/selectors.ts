import type { PcSnapshot } from '../ddb/types.ts';
import { turnOrder } from './order.ts';
import type { Combatant, CombatState, HitPoints } from './types.ts';

export type HealthDescriptor = 'Unhurt' | 'Hurt' | 'Bloodied' | 'Down';

export function healthDescriptor(hp: Pick<HitPoints, 'current' | 'max'>): HealthDescriptor {
  if (hp.current <= 0) return 'Down';
  if (hp.current >= hp.max) return 'Unhurt';
  if (hp.current <= hp.max / 2) return 'Bloodied';
  return 'Hurt';
}

/** Effective HP for display: DDB-linked PCs use the polled snapshot (ADR 0003). */
export function effectiveHp(c: Combatant, pcLive: Record<number, PcSnapshot | undefined>): HitPoints | null {
  const id = c.source?.ddbCharacterId;
  if (id !== undefined) {
    const snap = pcLive[id];
    return snap ? { ...snap.hp } : c.hp;
  }
  return c.hp;
}

/** A locally set AC (e.g. the DM noting Shield) wins over the sheet's AC. */
export function effectiveAc(c: Combatant, snap: PcSnapshot | undefined): number | null {
  return c.ac ?? snap?.stats?.ac ?? null;
}

/** DDB-linked PCs use the sheet's initiative bonus once it has been read. */
export function effectiveInitBonus(c: Combatant, snap: PcSnapshot | undefined): number {
  return snap?.stats?.initBonus ?? c.initBonus;
}

export interface PlayerViewCombatant {
  id: string;
  name: string;
  kind: Combatant['kind'];
  isActive: boolean;
  avatarUrl?: string;
  /** Exact HP: PCs only. */
  hp?: HitPoints;
  /** Descriptor: monsters/NPCs when `settings.showMonsterHealth`. */
  health?: HealthDescriptor;
  conditions: string[];
  concentrating: boolean;
  defeated: boolean;
}

export interface PlayerView {
  name: string;
  started: boolean;
  round: number;
  combatants: PlayerViewCombatant[];
}

/**
 * The only data sent to /table clients (ADR 0005). Anything not explicitly copied here
 * (notes, stat blocks, resources, prompts, hidden combatants) never leaves the server.
 */
export function playerView(state: CombatState, pcLive: Record<number, PcSnapshot | undefined> = {}): PlayerView {
  const combatants = turnOrder(state)
    .filter((c) => !c.hidden)
    .map((c): PlayerViewCombatant => {
      const hp = effectiveHp(c, pcLive);
      const snap = c.source?.ddbCharacterId !== undefined ? pcLive[c.source.ddbCharacterId] : undefined;
      const conditions = [
        ...c.conditions.map((x) => (x.level ? `${x.name} ${x.level}` : x.name)),
        ...(snap?.conditions ?? []).map((x) => (x.level ? `${x.name} ${x.level}` : x.name)),
      ];
      const v: PlayerViewCombatant = {
        id: c.id,
        name: c.name,
        kind: c.kind,
        isActive: state.activeId === c.id,
        avatarUrl: c.avatarUrl,
        conditions: [...new Set(conditions)],
        concentrating: !!c.concentration,
        defeated: c.defeated,
      };
      if (c.kind === 'pc' && hp) v.hp = hp;
      else if ((c.kind === 'monster' || c.kind === 'npc') && hp && state.settings.showMonsterHealth) v.health = healthDescriptor(hp);
      return v;
    });
  return { name: state.name, started: state.started, round: state.round, combatants };
}
