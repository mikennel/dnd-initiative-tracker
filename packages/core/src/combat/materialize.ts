import type { CombatEvent, CombatEventBody } from './events.ts';
import { apply, initialState } from './reducer.ts';
import type { CombatState } from './types.ts';

export interface Materialized {
  state: CombatState;
  /** Label of the event an `undo` would revert, or null. */
  undoLabel: string | null;
  redoLabel: string | null;
}

/**
 * Fold an event log into state, resolving undo/redo (ADR 0002).
 * `combat/created` is never undoable.
 */
export function materialize(combatId: string, events: readonly CombatEvent[]): Materialized {
  const active: CombatEvent[] = [];
  const redo: CombatEvent[] = [];
  for (const ev of events) {
    if (ev.body.type === 'undo') {
      const last = active[active.length - 1];
      if (last && last.body.type !== 'combat/created') redo.push(active.pop()!);
    } else if (ev.body.type === 'redo') {
      const next = redo.pop();
      if (next) active.push(next);
    } else {
      active.push(ev);
      redo.length = 0;
    }
  }
  const state = initialState(combatId);
  for (const ev of active) apply(state, ev.body, ev.eventId);
  const last = active[active.length - 1];
  const undoable = last && last.body.type !== 'combat/created' ? last : undefined;
  return {
    state,
    undoLabel: undoable ? describeEvent(undoable.body, state) : null,
    redoLabel: redo.length ? describeEvent(redo[redo.length - 1].body, state) : null,
  };
}

/** Short human label for undo/redo buttons and the event log. */
export function describeEvent(e: CombatEventBody, s?: CombatState): string {
  const name = (id: string) => s?.combatants[id]?.name ?? 'combatant';
  switch (e.type) {
    case 'combat/created': return 'Create combat';
    case 'combat/renamed': return 'Rename combat';
    case 'combat/settings': return 'Change settings';
    case 'combat/lineup': return e.open ? 'Show order to players' : 'Back to setup';
    case 'combat/started': return 'Start combat';
    case 'combat/ended': return 'End combat';
    case 'statblock/added': return 'Add stat block';
    case 'combatant/added': return `Add ${e.combatant.name}`;
    case 'combatant/removed': return `Remove ${name(e.id)}`;
    case 'combatant/updated': return `Edit ${name(e.id)}`;
    case 'initiative/set': return `Initiative for ${name(e.id)}`;
    case 'initiative/swapped': return `Alert: ${name(e.a)} ⇄ ${name(e.b)}`;
    case 'hp/damage': return `${e.amount} damage to ${name(e.id)}`;
    case 'hp/heal': return `Heal ${name(e.id)} ${e.amount}`;
    case 'hp/temp': return `Temp HP for ${name(e.id)}`;
    case 'hp/set': return `Set HP of ${name(e.id)}`;
    case 'hp/scaled': return `${name(e.id)} HP ×${e.factor}`;
    case 'condition/added': return `${e.condition.name} on ${name(e.id)}`;
    case 'condition/removed': return `Remove condition from ${name(e.id)}`;
    case 'concentration/set': return e.spell ? `${name(e.id)} concentrates` : `${name(e.id)} drops concentration`;
    case 'resource/added': return `Add ${e.resource.name}`;
    case 'resource/removed': return 'Remove resource';
    case 'resource/used': return `Use resource of ${name(e.id)}`;
    case 'resource/slotUsed': return `Spell slot of ${name(e.id)}`;
    case 'resource/recharge': return `Recharge for ${name(e.id)}`;
    case 'turn/next': return 'Next turn';
    case 'turn/prev': return 'Previous turn';
    case 'turn/set': return `Jump to ${name(e.id)}`;
    case 'prompt/dismissed': return 'Dismiss prompt';
    case 'batch': return e.label;
    case 'undo': return 'Undo';
    case 'redo': return 'Redo';
  }
}
