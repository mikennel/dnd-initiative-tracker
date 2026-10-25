import { describe, expect, it } from 'vitest';
import type { CombatEvent, CombatEventBody, NewCombatant } from '../src/combat/events.ts';
import { materialize } from '../src/combat/materialize.ts';
import { turnOrder } from '../src/combat/order.ts';
import { concentrationDc } from '../src/combat/reducer.ts';
import { playerView } from '../src/combat/selectors.ts';

let n = 0;
const ev = (body: CombatEventBody): CombatEvent => ({ eventId: `e${++n}`, ts: n, body });

function combatant(id: string, over: Partial<NewCombatant> = {}): NewCombatant {
  return {
    id,
    kind: 'monster',
    name: id,
    initiative: null,
    initBonus: 0,
    ac: 12,
    hp: { current: 20, max: 20, temp: 0 },
    hidden: false,
    defeated: false,
    conditions: [],
    concentration: null,
    resources: [],
    notes: '',
    ...over,
  };
}

function run(...bodies: CombatEventBody[]) {
  return materialize('c1', [ev({ type: 'combat/created', name: 'Test', campaign: null, sourceEncounterId: null }), ...bodies.map(ev)]);
}

const add = (id: string, over: Partial<NewCombatant> = {}): CombatEventBody => ({ type: 'combatant/added', combatant: combatant(id, over) });

describe('turn order', () => {
  it('sorts by initiative, then init bonus, then dex, then insertion order; unrolled last', () => {
    const { state } = run(
      add('a', { initiative: 15, initBonus: 1 }),
      add('b', { initiative: 15, initBonus: 3 }),
      add('c', { initiative: 20 }),
      add('d', { initiative: null }),
      add('e', { initiative: 15, initBonus: 3, dex: 18 }),
      add('f', { initiative: 15, initBonus: 3, dex: 18 }),
    );
    expect(turnOrder(state).map((c) => c.id)).toEqual(['c', 'e', 'f', 'b', 'a', 'd']);
  });

  it('starts combat on first next, advances, and rolls over rounds', () => {
    const base = [add('a', { initiative: 20 }), add('b', { initiative: 10 })];
    let r = run(...base, { type: 'turn/next' });
    expect(r.state.started).toBe(true);
    expect(r.state.round).toBe(1);
    expect(r.state.activeId).toBe('a');
    r = run(...base, { type: 'turn/next' }, { type: 'turn/next' }, { type: 'turn/next' });
    expect(r.state.activeId).toBe('a');
    expect(r.state.round).toBe(2);
    r = run(...base, { type: 'turn/next' }, { type: 'turn/next' }, { type: 'turn/next' }, { type: 'turn/prev' });
    expect(r.state.activeId).toBe('b');
    expect(r.state.round).toBe(1);
  });

  it('skips defeated monsters but not PCs', () => {
    const { state } = run(
      add('a', { initiative: 20 }),
      add('dead', { initiative: 15 }),
      add('pc', { initiative: 10, kind: 'pc', hp: null }),
      { type: 'hp/damage', id: 'dead', amount: 99 },
      { type: 'turn/next' },
      { type: 'turn/next' },
    );
    expect(state.combatants.dead.defeated).toBe(true);
    expect(state.activeId).toBe('pc');
  });

  it('moves the turn on when the active combatant is removed', () => {
    const { state } = run(add('a', { initiative: 20 }), add('b', { initiative: 10 }), { type: 'turn/next' }, { type: 'combatant/removed', id: 'a' });
    expect(state.activeId).toBe('b');
  });
});

describe('hit points', () => {
  it('temp HP absorbs damage first and HP never goes below 0', () => {
    const { state } = run(add('a'), { type: 'hp/temp', id: 'a', amount: 5 }, { type: 'hp/damage', id: 'a', amount: 8 });
    expect(state.combatants.a.hp).toEqual({ current: 17, max: 20, temp: 0 });
    const r2 = run(add('a'), { type: 'hp/damage', id: 'a', amount: 50 });
    expect(r2.state.combatants.a.hp!.current).toBe(0);
    expect(r2.state.combatants.a.defeated).toBe(true);
  });

  it('heal caps at max and revives', () => {
    const { state } = run(add('a'), { type: 'hp/damage', id: 'a', amount: 50 }, { type: 'hp/heal', id: 'a', amount: 100 });
    expect(state.combatants.a.hp!.current).toBe(20);
    expect(state.combatants.a.defeated).toBe(false);
  });
});

describe('concentration', () => {
  it('DC is max(10, half damage) capped at 30', () => {
    expect(concentrationDc(5)).toBe(10);
    expect(concentrationDc(31)).toBe(15);
    expect(concentrationDc(100)).toBe(30);
  });

  it('damage to a concentrating creature prompts a CON save', () => {
    const { state } = run(
      add('a', { hp: { current: 40, max: 40, temp: 0 } }),
      { type: 'concentration/set', id: 'a', spell: 'Hold Person' },
      { type: 'hp/damage', id: 'a', amount: 24 },
    );
    expect(state.prompts).toHaveLength(1);
    expect(state.prompts[0]).toMatchObject({ kind: 'concentration', dc: 12, combatantId: 'a' });
  });

  it('dropping to 0 or becoming incapacitated ends concentration', () => {
    let r = run(add('a'), { type: 'concentration/set', id: 'a', spell: 'Bless' }, { type: 'hp/damage', id: 'a', amount: 20 });
    expect(r.state.combatants.a.concentration).toBeNull();
    r = run(
      add('a'),
      { type: 'concentration/set', id: 'a', spell: 'Bless' },
      { type: 'condition/added', id: 'a', condition: { id: 'x', key: 'stunned', name: 'Stunned', duration: { kind: 'manual' } } },
    );
    expect(r.state.combatants.a.concentration).toBeNull();
  });

  it('prompts for PCs mirrored from DDB even though local HP is null', () => {
    const { state } = run(add('pc', { kind: 'pc', hp: null }), { type: 'concentration/set', id: 'pc', spell: 'Bless' }, { type: 'hp/damage', id: 'pc', amount: 4 });
    expect(state.prompts[0]).toMatchObject({ kind: 'concentration', dc: 10 });
  });
});

describe('condition durations', () => {
  const stun: CombatEventBody = {
    type: 'condition/added',
    id: 'b',
    condition: { id: 'stun', key: 'stunned', name: 'Stunned', sourceId: 'a', duration: { kind: 'rounds', rounds: 1, tick: 'end', anchorId: 'a' } },
  };
  const base = [add('a', { initiative: 20 }), add('b', { initiative: 10 }), { type: 'turn/next' } as CombatEventBody];

  it('"until the end of the source\'s next turn" applied on the source\'s turn survives the current turn', () => {
    const next: CombatEventBody = { type: 'turn/next' };
    expect(run(...base, stun, next).state.combatants.b.conditions).toHaveLength(1); // b's turn
    expect(run(...base, stun, next, next).state.combatants.b.conditions).toHaveLength(1); // a's next turn
    expect(run(...base, stun, next, next, next).state.combatants.b.conditions).toHaveLength(0); // a's next turn ended
  });

  it('"until the start of the source\'s next turn" expires when that turn starts', () => {
    const until: CombatEventBody = { ...stun, condition: { ...(stun as any).condition, duration: { kind: 'rounds', rounds: 1, tick: 'start', anchorId: 'a' } } } as CombatEventBody;
    const next: CombatEventBody = { type: 'turn/next' };
    expect(run(...base, until, next).state.combatants.b.conditions).toHaveLength(1);
    expect(run(...base, until, next, next).state.combatants.b.conditions).toHaveLength(0);
  });

  it('save-ends conditions prompt at the end of the affected creature\'s turn', () => {
    const { state } = run(
      ...base,
      { type: 'condition/added', id: 'b', condition: { id: 'p', key: 'paralyzed', name: 'Paralyzed', duration: { kind: 'saveEnds', ability: 'wis', dc: 15, tick: 'end' } } },
      { type: 'turn/next' },
      { type: 'turn/next' },
    );
    expect(state.prompts.find((p) => p.kind === 'save')).toMatchObject({ combatantId: 'b', dc: 15, ability: 'wis' });
  });
});

describe('resources', () => {
  it('legendary actions reset at the start of the creature\'s turn; recharge prompts', () => {
    const { state } = run(
      add('drag', {
        initiative: 20,
        resources: [
          { id: 'la', kind: 'uses', name: 'Legendary Actions', max: 3, used: 0, reset: 'turnStart' },
          { id: 'br', kind: 'recharge', name: 'Fire Breath', min: 5, charged: true },
        ],
      }),
      add('pc', { initiative: 10 }),
      { type: 'turn/next' },
      { type: 'resource/recharge', id: 'drag', resourceId: 'br', charged: false },
      { type: 'turn/next' },
      { type: 'resource/used', id: 'drag', resourceId: 'la', delta: 2 },
      { type: 'turn/next' },
    );
    const drag = state.combatants.drag;
    expect(drag.resources.find((r) => r.id === 'la')).toMatchObject({ used: 0 });
    expect(state.prompts.find((p) => p.kind === 'recharge')).toMatchObject({ resourceId: 'br' });
  });

  it('uses clamp to [0, max]', () => {
    const { state } = run(
      add('a', { resources: [{ id: 'u', kind: 'uses', name: 'x', max: 2, used: 0, reset: 'day' }] }),
      { type: 'resource/used', id: 'a', resourceId: 'u', delta: 5 },
    );
    expect(state.combatants.a.resources[0]).toMatchObject({ used: 2 });
  });
});

describe('undo / redo', () => {
  it('undoes and redoes the last action; new actions clear redo', () => {
    const r1 = run(add('a'), { type: 'hp/damage', id: 'a', amount: 5 }, { type: 'undo' });
    expect(r1.state.combatants.a.hp!.current).toBe(20);
    expect(r1.redoLabel).toBe('5 damage to a');
    const r2 = run(add('a'), { type: 'hp/damage', id: 'a', amount: 5 }, { type: 'undo' }, { type: 'redo' });
    expect(r2.state.combatants.a.hp!.current).toBe(15);
    const r3 = run(add('a'), { type: 'hp/damage', id: 'a', amount: 5 }, { type: 'undo' }, { type: 'hp/heal', id: 'a', amount: 1 }, { type: 'redo' });
    expect(r3.state.combatants.a.hp!.current).toBe(20);
    expect(r3.redoLabel).toBeNull();
  });

  it('never undoes combat creation; batches undo as one step', () => {
    const r = run(
      { type: 'batch', label: 'Import', events: [add('a'), add('b')] },
      { type: 'undo' },
      { type: 'undo' },
      { type: 'undo' },
    );
    expect(Object.keys(r.state.combatants)).toEqual([]);
    expect(r.state.name).toBe('Test');
  });

  it('replay is deterministic', () => {
    const bodies: CombatEventBody[] = [add('a', { initiative: 5 }), { type: 'concentration/set', id: 'a', spell: 'Bless' }, { type: 'hp/damage', id: 'a', amount: 3 }, { type: 'turn/next' }];
    const events = [ev({ type: 'combat/created', name: 'T', campaign: null, sourceEncounterId: null }), ...bodies.map(ev)];
    expect(materialize('c', events).state).toEqual(materialize('c', events).state);
  });
});

describe('player view', () => {
  it('hides hidden combatants and reduces monster HP to a descriptor', () => {
    const { state } = run(
      add('m', { initiative: 10, hp: { current: 9, max: 20, temp: 0 }, notes: 'secret' }),
      add('h', { initiative: 12, hidden: true }),
      add('pc', { initiative: 14, kind: 'pc', hp: null, source: { ddbCharacterId: 7 } }),
    );
    const view = playerView(state, {
      7: { characterId: 7, name: 'PC', level: 3, hp: { current: 10, max: 30, temp: 2 }, conditions: [{ name: 'Poisoned' }], deathSaves: { fail: 0, success: 0, stable: false }, spellSlots: [], pactSlots: [], limitedUses: [], avatarUrl: null, fetchedAt: 0 },
    });
    expect(view.combatants.map((c) => c.id)).toEqual(['pc', 'm']);
    expect(view.combatants[0]).toMatchObject({ hp: { current: 10, max: 30, temp: 2 }, conditions: ['Poisoned'] });
    expect(view.combatants[1]).toMatchObject({ health: 'Bloodied' });
    expect(view.combatants[1]).not.toHaveProperty('hp');
    expect(JSON.stringify(view)).not.toContain('secret');
  });
});
