import type { MonsterStatBlock } from '../ddb/types.ts';
import type { CombatCondition, CombatSettings, Combatant, Resource } from './types.ts';

/**
 * Every DM action is one of these. Events are immutable once stored (ADR 0002):
 * add new event types rather than changing the shape of existing ones.
 * Any randomness (dice) must be resolved *before* the event is created.
 */
export type CombatEventBody =
  | { type: 'combat/created'; name: string; campaign: { id: number; name: string } | null; sourceEncounterId: string | null }
  | { type: 'combat/renamed'; name: string }
  | { type: 'combat/settings'; patch: Partial<CombatSettings> }
  | { type: 'combat/started' }
  | { type: 'combat/ended' }
  | { type: 'statblock/added'; key: string; statBlock: MonsterStatBlock }
  /** `statBlock` is stored in `state.statBlocks[combatant.source.ddbMonsterId]` when provided. */
  | { type: 'combatant/added'; combatant: NewCombatant; statBlock?: MonsterStatBlock }
  | { type: 'combatant/removed'; id: string }
  | { type: 'combatant/updated'; id: string; patch: CombatantPatch }
  | { type: 'initiative/set'; id: string; value: number | null }
  | { type: 'hp/damage'; id: string; amount: number }
  | { type: 'hp/heal'; id: string; amount: number }
  | { type: 'hp/temp'; id: string; amount: number }
  | { type: 'hp/set'; id: string; current?: number; max?: number }
  | { type: 'condition/added'; id: string; condition: CombatCondition }
  | { type: 'condition/removed'; id: string; conditionId: string }
  | { type: 'concentration/set'; id: string; spell: string | null }
  | { type: 'resource/added'; id: string; resource: Resource }
  | { type: 'resource/removed'; id: string; resourceId: string }
  | { type: 'resource/used'; id: string; resourceId: string; delta: number }
  | { type: 'resource/slotUsed'; id: string; resourceId: string; level: number; delta: number }
  /** A recharge roll (the die was rolled client-side). `roll` undefined means set manually. */
  | { type: 'resource/recharge'; id: string; resourceId: string; charged: boolean; roll?: number }
  | { type: 'turn/next' }
  | { type: 'turn/prev' }
  | { type: 'turn/set'; id: string }
  | { type: 'prompt/dismissed'; promptId: string }
  /** Several events applied (and undone) as one step, e.g. importing an encounter. */
  | { type: 'batch'; label: string; events: CombatEventBody[] }
  | { type: 'undo' }
  | { type: 'redo' };

export type NewCombatant = Omit<Combatant, 'order'> & { order?: number };

export type CombatantPatch = Partial<
  Pick<Combatant, 'name' | 'ac' | 'initBonus' | 'hidden' | 'defeated' | 'notes' | 'roundsRemaining' | 'description' | 'group' | 'avatarUrl'>
>;

export interface CombatEvent<B extends CombatEventBody = CombatEventBody> {
  /** Client-generated unique id; the server dedups on it. */
  eventId: string;
  /** Server-assigned sequence number (absent while pending on the client). */
  seq?: number;
  /** Client timestamp (ms). */
  ts: number;
  body: B;
}

export type CombatEventType = CombatEventBody['type'];
