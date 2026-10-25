import type { CombatEvent, CombatEventBody } from './events.ts';
import { activeTurnOrder } from './order.ts';
import type { Combatant, CombatPrompt, CombatState } from './types.ts';
import { DEFAULT_SETTINGS } from './types.ts';

/** Conditions that end concentration (they all include Incapacitated). */
const BREAKS_CONCENTRATION = new Set(['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious']);
const MAX_LOG = 300;

export function initialState(id: string): CombatState {
  return {
    id,
    name: 'New combat',
    campaign: null,
    sourceEncounterId: null,
    combatants: {},
    started: false,
    round: 0,
    activeId: null,
    prompts: [],
    settings: { ...DEFAULT_SETTINGS },
    statBlocks: {},
    log: [],
    nextOrder: 0,
  };
}

/** Concentration save DC after taking `damage` (2024 rules cap it at 30). */
export function concentrationDc(damage: number): number {
  return Math.min(30, Math.max(10, Math.floor(damage / 2)));
}

/** Pure: returns a new state. The internals mutate a private clone. */
export function reduce(state: CombatState, event: CombatEvent): CombatState {
  const draft = structuredClone(state);
  apply(draft, event.body, event.eventId);
  return draft;
}

/** Mutates `s`. Only call on a state you own (see `materialize`). */
export function apply(s: CombatState, e: CombatEventBody, eventId: string): void {
  const c = 'id' in e && typeof e.id === 'string' ? s.combatants[e.id] : undefined;
  const log = (text: string) => {
    s.log.push({ round: s.round, text });
    if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
  };
  const prompt = (p: Omit<CombatPrompt, 'id'>, suffix: string) => {
    s.prompts.push({ id: `${eventId}:${suffix}`, ...p });
  };

  switch (e.type) {
    case 'combat/created':
      s.name = e.name;
      s.campaign = e.campaign;
      s.sourceEncounterId = e.sourceEncounterId;
      return;
    case 'combat/renamed':
      s.name = e.name;
      return;
    case 'combat/settings':
      s.settings = { ...s.settings, ...e.patch };
      return;
    case 'combat/started': {
      s.started = true;
      s.round = 1;
      s.prompts = [];
      const first = activeTurnOrder(s)[0];
      s.activeId = first?.id ?? null;
      log('Combat started');
      if (first) startTurn(s, first, eventId, prompt, log);
      return;
    }
    case 'combat/ended':
      s.started = false;
      s.activeId = null;
      s.prompts = [];
      log('Combat ended');
      return;
    case 'statblock/added':
      s.statBlocks[e.key] = structuredClone(e.statBlock);
      return;
    case 'combatant/added': {
      const order = e.combatant.order ?? s.nextOrder;
      s.nextOrder = Math.max(s.nextOrder, order) + 1;
      s.combatants[e.combatant.id] = { ...structuredClone(e.combatant), order };
      if (e.statBlock) s.statBlocks[statBlockKey(e.combatant.source?.ddbMonsterId, e.statBlock.id)] = structuredClone(e.statBlock);
      if (s.started) log(`${e.combatant.name} joined the fight`);
      return;
    }
    case 'combatant/removed': {
      if (!c) return;
      if (s.activeId === c.id) {
        const order = activeTurnOrder(s);
        const idx = order.findIndex((x) => x.id === c.id);
        const remaining = order.filter((x) => x.id !== c.id);
        s.activeId = (remaining[idx] ?? remaining[0])?.id ?? null;
      }
      delete s.combatants[c.id];
      s.prompts = s.prompts.filter((p) => p.combatantId !== c.id);
      return;
    }
    case 'combatant/updated':
      if (!c) return;
      Object.assign(c, e.patch);
      return;
    case 'initiative/set':
      if (c) c.initiative = e.value;
      return;
    case 'hp/damage': {
      if (!c || e.amount <= 0) return;
      let rest = e.amount;
      if (c.hp) {
        const absorbed = Math.min(c.hp.temp, rest);
        c.hp.temp -= absorbed;
        rest -= absorbed;
        c.hp.current = Math.max(0, c.hp.current - rest);
        log(`${c.name} took ${e.amount} damage (${c.hp.current}/${c.hp.max})`);
        if (c.hp.current === 0 && c.kind !== 'pc' && !c.defeated) {
          c.defeated = true;
          log(`${c.name} is down`);
        }
      }
      if (c.concentration) {
        if (c.hp && c.hp.current === 0) {
          log(`${c.name} lost concentration on ${c.concentration}`);
          c.concentration = null;
        } else {
          const dc = concentrationDc(e.amount);
          prompt(
            { kind: 'concentration', combatantId: c.id, dc, ability: 'con', text: `${c.name}: CON save DC ${dc} to keep ${c.concentration}` },
            'conc',
          );
        }
      }
      return;
    }
    case 'hp/heal':
      if (!c?.hp || e.amount <= 0) return;
      c.hp.current = Math.min(c.hp.max, c.hp.current + e.amount);
      if (c.hp.current > 0) c.defeated = false;
      log(`${c.name} healed ${e.amount} (${c.hp.current}/${c.hp.max})`);
      return;
    case 'hp/temp':
      if (!c?.hp) return;
      c.hp.temp = Math.max(0, e.amount);
      return;
    case 'hp/set':
      if (!c?.hp) return;
      if (e.max !== undefined) c.hp.max = Math.max(0, e.max);
      if (e.current !== undefined) c.hp.current = Math.max(0, e.current);
      c.hp.current = Math.min(c.hp.current, c.hp.max);
      c.defeated = c.kind !== 'pc' && c.hp.current === 0;
      return;
    case 'condition/added': {
      if (!c) return;
      const cond = structuredClone(e.condition);
      // "Until the end of X's next turn" applied during X's own turn must survive the current turn end.
      if (cond.duration.kind === 'rounds' && cond.duration.tick === 'end' && cond.duration.anchorId === s.activeId) {
        cond.duration.rounds += 1;
      }
      c.conditions.push(cond);
      log(`${c.name} is ${e.condition.name}${e.condition.level ? ` ${e.condition.level}` : ''}`);
      if (c.concentration && BREAKS_CONCENTRATION.has(e.condition.key)) {
        log(`${c.name} lost concentration on ${c.concentration}`);
        c.concentration = null;
      }
      return;
    }
    case 'condition/removed':
      if (!c) return;
      c.conditions = c.conditions.filter((x) => x.id !== e.conditionId);
      s.prompts = s.prompts.filter((p) => p.conditionId !== e.conditionId);
      return;
    case 'concentration/set':
      if (!c) return;
      if (c.concentration && !e.spell) log(`${c.name} stopped concentrating on ${c.concentration}`);
      if (e.spell) log(`${c.name} is concentrating on ${e.spell}`);
      c.concentration = e.spell;
      if (!e.spell) s.prompts = s.prompts.filter((p) => !(p.kind === 'concentration' && p.combatantId === c.id));
      return;
    case 'resource/added':
      c?.resources.push(structuredClone(e.resource));
      return;
    case 'resource/removed':
      if (c) c.resources = c.resources.filter((r) => r.id !== e.resourceId);
      return;
    case 'resource/used': {
      const r = c?.resources.find((x) => x.id === e.resourceId);
      if (r?.kind === 'uses') r.used = clamp(r.used + e.delta, 0, r.max);
      return;
    }
    case 'resource/slotUsed': {
      const r = c?.resources.find((x) => x.id === e.resourceId);
      const slot = r?.kind === 'slots' ? r.slots.find((x) => x.level === e.level) : undefined;
      if (slot) slot.used = clamp(slot.used + e.delta, 0, slot.max);
      return;
    }
    case 'resource/recharge': {
      const r = c?.resources.find((x) => x.id === e.resourceId);
      if (r?.kind !== 'recharge' || !c) return;
      r.charged = e.charged;
      r.lastRoll = e.roll;
      s.prompts = s.prompts.filter((p) => !(p.kind === 'recharge' && p.resourceId === r.id));
      if (e.roll !== undefined) log(`${c.name} rolled ${e.roll} for ${r.name}: ${e.charged ? 'recharged' : 'not recharged'}`);
      return;
    }
    case 'turn/next': {
      const order = activeTurnOrder(s);
      if (order.length === 0) return;
      if (!s.started) {
        apply(s, { type: 'combat/started' }, eventId);
        return;
      }
      const idx = order.findIndex((x) => x.id === s.activeId);
      const current = order[idx];
      if (current) endTurn(s, current, eventId, prompt, log);
      // Recharge prompts only matter on the creature's own turn.
      s.prompts = s.prompts.filter((p) => p.kind !== 'recharge');
      let nextIdx = idx + 1;
      if (nextIdx >= order.length) {
        nextIdx = 0;
        s.round += 1;
        log(`Round ${s.round}`);
      }
      const next = order[nextIdx];
      s.activeId = next.id;
      startTurn(s, next, eventId, prompt, log);
      return;
    }
    case 'turn/prev': {
      const order = activeTurnOrder(s);
      const idx = order.findIndex((x) => x.id === s.activeId);
      if (idx < 0 || !s.started) return;
      if (idx === 0) {
        if (s.round <= 1) return;
        s.round -= 1;
        s.activeId = order[order.length - 1].id;
      } else {
        s.activeId = order[idx - 1].id;
      }
      return;
    }
    case 'turn/set':
      if (c) s.activeId = c.id;
      return;
    case 'prompt/dismissed':
      s.prompts = s.prompts.filter((p) => p.id !== e.promptId);
      return;
    case 'batch':
      e.events.forEach((sub, i) => apply(s, sub, `${eventId}.${i}`));
      return;
    case 'undo':
    case 'redo':
      // Resolved by `materialize`; never reaches the reducer.
      return;
  }
}

type PromptFn = (p: Omit<CombatPrompt, 'id'>, suffix: string) => void;
type LogFn = (text: string) => void;

function startTurn(s: CombatState, c: Combatant, eventId: string, prompt: PromptFn, log: LogFn) {
  for (const r of c.resources) {
    if (r.kind === 'uses' && r.reset === 'turnStart') r.used = 0;
    if (r.kind === 'recharge' && !r.charged) {
      prompt({ kind: 'recharge', combatantId: c.id, resourceId: r.id, text: `${c.name}: roll recharge for ${r.name} (${r.min}–6)` }, `rc:${r.id}`);
    }
  }
  if (c.kind === 'effect' && c.roundsRemaining !== undefined) {
    c.roundsRemaining -= 1;
    if (c.roundsRemaining <= 0) {
      prompt({ kind: 'effect', combatantId: c.id, text: `${c.name} has ended` }, `fx:${c.id}`);
      log(`${c.name} ended`);
    }
  }
  tickConditions(s, c, 'start', eventId, prompt, log);
}

function endTurn(s: CombatState, c: Combatant, eventId: string, prompt: PromptFn, log: LogFn) {
  tickConditions(s, c, 'end', eventId, prompt, log);
}

/** Tick every condition anchored to `turnOwner`'s start/end of turn, on any combatant. */
function tickConditions(s: CombatState, turnOwner: Combatant, tick: 'start' | 'end', eventId: string, prompt: PromptFn, log: LogFn) {
  for (const target of Object.values(s.combatants)) {
    target.conditions = target.conditions.filter((cond) => {
      const d = cond.duration;
      if (d.kind === 'rounds' && d.tick === tick && d.anchorId === turnOwner.id) {
        d.rounds -= 1;
        if (d.rounds <= 0) {
          log(`${target.name} is no longer ${cond.name}`);
          return false;
        }
      }
      if (d.kind === 'saveEnds' && d.tick === tick && target.id === turnOwner.id) {
        prompt(
          {
            kind: 'save',
            combatantId: target.id,
            conditionId: cond.id,
            dc: d.dc,
            ability: d.ability,
            text: `${target.name}: ${d.ability.toUpperCase()} save DC ${d.dc} to end ${cond.name}`,
          },
          `save:${cond.id}:${s.round}`,
        );
      }
      return true;
    });
  }
}

export function statBlockKey(ddbMonsterId: number | undefined, fallback: string | number): string {
  return String(ddbMonsterId ?? fallback);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
