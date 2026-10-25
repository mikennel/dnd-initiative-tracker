import { describe, expect, it } from 'vitest';
import configJson from './fixtures/ddb-config.slim.json' with { type: 'json' };
import type { DdbConfig } from '../src/ddb/config.ts';
import { characterHp, mapCharacter, spellSlotMax } from '../src/ddb/mapCharacter.ts';
import { mapCharacterSummary, mergePcSnapshot } from '../src/ddb/mapCharacterSummary.ts';
import { encounterToEvents } from '../src/ddb/mapEncounter.ts';
import { letterSuffix, mapMonster, monsterToCombatant } from '../src/ddb/mapMonster.ts';
import { sanitizeHtml } from '../src/ddb/html.ts';
import { extractResources } from '../src/ddb/parseStatBlock.ts';
import type { DdbCharacter, DdbCharacterSummary } from '../src/ddb/types.ts';
import { difficulty2014, difficulty2024 } from '../src/encounter/difficulty.ts';
import { beholder2024, legacyDragonMage } from './fixtures/monsters.ts';

const cfg = configJson as unknown as DdbConfig;

describe('mapMonster', () => {
  const sb = mapMonster(beholder2024, cfg);

  it('maps core stats via config lookups', () => {
    expect(sb).toMatchObject({
      name: 'Beholder',
      size: 'Large',
      type: 'Aberration',
      ac: 18,
      hp: 190,
      hpDice: '20d10 + 80',
      cr: '13',
      xp: 10000,
      proficiencyBonus: 5,
      initBonus: 12,
      speed: '5 ft., fly 40 ft. (hover)',
      saves: 'Con +9, Wis +7',
      skills: 'Perception +12',
      senses: 'Darkvision 120 ft., Passive Perception 22',
      conditionImmunities: 'Prone',
    });
  });

  it('parses features from DDB HTML', () => {
    expect(sb.sections.actions!.features.map((f) => f.name)).toEqual(['Multiattack', 'Bite', 'Eye Rays', '1: Charm Ray']);
    expect(sb.sections.actions!.features[1].text).toContain('+8, reach 5 ft.');
    expect(sb.sections.legendary!.features[0].name).toBe('');
  });

  it('extracts legendary resistance and legendary actions', () => {
    const res = extractResources(sb, 'b');
    expect(res).toEqual([
      { id: 'b:0', kind: 'uses', name: 'Legendary Resistance', max: 3, used: 0, reset: 'day', note: '4/Day in lair' },
      { id: 'b:1', kind: 'uses', name: 'Legendary Actions', max: 3, used: 0, reset: 'turnStart', note: '4 in lair' },
    ]);
  });

  it('extracts recharge, rest-recharge, legacy slots, innate x/day and legacy legendary actions', () => {
    const dm = mapMonster(legacyDragonMage, cfg);
    expect(dm.resistances).toBe('Bludgeoning');
    expect(dm.immunities).toBe('Fire');
    expect(dm.initBonus).toBe(0);
    const res = extractResources(dm, 'd');
    const byName = Object.fromEntries(res.map((r) => [r.name, r]));
    expect(byName['Fire Breath']).toMatchObject({ kind: 'recharge', min: 5, charged: true });
    expect(byName['Wing Gust']).toMatchObject({ kind: 'uses', max: 1, reset: 'shortRest' });
    expect(byName['Spell Slots']).toMatchObject({ kind: 'slots', slots: [{ level: 1, max: 4, used: 0 }, { level: 2, max: 3, used: 0 }] });
    expect(byName['fireball']).toMatchObject({ kind: 'uses', max: 3 });
    expect(byName['haste']).toMatchObject({ kind: 'uses', max: 3 });
    expect(byName['Legendary Actions']).toMatchObject({ max: 3, reset: 'turnStart' });
  });

  it('builds a combatant with average or rolled HP', () => {
    const avg = monsterToCombatant(sb, { id: 'm1' });
    expect(avg.hp).toEqual({ current: 190, max: 190, temp: 0 });
    expect(avg.source).toEqual({ ddbMonsterId: 5194923 });
    const rolled = monsterToCombatant(sb, { id: 'm2', hp: 'roll', rng: () => 0 });
    expect(rolled.hp!.max).toBe(20 + 80);
  });

  it('letter suffixes', () => {
    expect([0, 1, 25, 26, 27].map(letterSuffix)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });
});

describe('sanitizeHtml', () => {
  it('removes scripts and handlers and absolutizes links', () => {
    const out = sanitizeHtml('<p onclick="x()">a<script>evil()</script><a href="/spells/fireball">fb</a><a href="javascript:alert(1)">x</a></p>');
    expect(out).not.toMatch(/script|onclick|javascript/);
    expect(out).toContain('href="https://www.dndbeyond.com/spells/fireball"');
  });
});

/** Synthetic character with the same numbers as a real sheet verified against DDB's tracker (55/110). */
const character: DdbCharacter = {
  id: 1001,
  name: 'Test Paladin',
  baseHitPoints: 42,
  bonusHitPoints: 5,
  overrideHitPoints: null,
  removedHitPoints: 55,
  temporaryHitPoints: 3,
  stats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: id === 3 ? 17 : 10 })),
  bonusStats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: null })),
  overrideStats: [1, 2, 3, 4, 5, 6].map((id) => ({ id, value: null })),
  modifiers: {
    race: [{ type: 'bonus', subType: 'constitution-score', value: 2, fixedValue: 2 }],
    feat: [
      { type: 'bonus', subType: 'hit-points-per-level', value: 2, fixedValue: 2 },
      { type: 'bonus', subType: 'constitution-score', value: 1, fixedValue: 1 },
    ],
    item: [{ type: 'bonus', subType: 'hit-points', value: null, fixedValue: 2, componentId: 77 }],
  },
  inventory: [{ equipped: false, isAttuned: false, definition: { id: 77, name: 'Potion of Healing', canAttune: false } }],
  classes: [
    { level: 1, definition: { name: 'Paladin', spellRules: { multiClassSpellSlotDivisor: 2, multiClassSpellSlotRounding: 2, levelSpellSlots: [[], [2, 0, 0, 0, 0, 0, 0, 0, 0]] } } },
    {
      level: 8,
      definition: {
        name: 'Sorcerer',
        spellRules: { multiClassSpellSlotDivisor: 1, multiClassSpellSlotRounding: 1, levelSpellSlots: [[], [], [], [], [], [], [], [], [4, 3, 3, 2, 0, 0, 0, 0, 0]] },
      },
    },
  ],
  conditions: [{ id: 4, level: 2 }, { id: 11, level: null }],
  deathSaves: { failCount: 0, successCount: 1, isStabilized: false },
  spellSlots: [{ level: 1, used: 1, available: 0 }, { level: 2, used: 2, available: 0 }],
  actions: { class: [{ name: 'Lay On Hands', limitedUse: { maxUses: 1, numberUsed: 0 } }, { name: 'Smite', limitedUse: null }] },
  feats: [{ definition: { name: 'Tough' } }, { definition: { name: 'Alert' } }, { definition: null }],
};

describe('mapCharacter', () => {
  it('computes HP like DDB (unequipped item bonuses ignored)', () => {
    expect(characterHp(character)).toEqual({ max: 110, current: 55, temp: 3 });
  });

  it('counts equipped item HP bonuses', () => {
    const equipped = { ...character, inventory: [{ ...character.inventory![0], equipped: true }] };
    expect(characterHp(equipped).max).toBe(112);
  });

  it('uses override HP when set', () => {
    expect(characterHp({ ...character, overrideHitPoints: 80 }).max).toBe(80);
  });

  it('computes multiclass spell slots from the shared table', () => {
    // Paladin 1 (half, round up → 1) + Sorcerer 8 = caster level 9
    expect(spellSlotMax(character, cfg)).toEqual(cfg.multiClassSpellSlots[9]);
  });

  it('builds a snapshot', () => {
    const snap = mapCharacter(character, cfg, 123);
    expect(snap.conditions).toEqual([{ name: 'Exhaustion', level: 2 }, { name: 'Poisoned' }]);
    expect(snap.deathSaves).toEqual({ fail: 0, success: 1, stable: false });
    expect(snap.spellSlots[0]).toEqual({ level: 1, max: 4, used: 1 });
    expect(snap.limitedUses).toEqual([{ name: 'Lay On Hands', max: 1, used: 0 }]);
    expect(snap.feats).toEqual(['Tough', 'Alert']);
    expect(snap.level).toBe(9);
  });
});

/** Shaped like a real scds summary (multiclass caster with two save DCs). */
const summary: DdbCharacterSummary = {
  characterId: 1001,
  name: 'Test Paladin',
  level: 9,
  armorClass: 21,
  initiativeBonus: 1,
  proficiencyBonus: 4,
  passivePerception: 16,
  passiveInsight: 12,
  passiveInvestigation: 11,
  hitPointInfo: { maximum: 110, current: 55, temp: 0 },
  conditions: [{ name: 'Exhaustion', level: 1 }, { name: 'Restrained', level: null }],
  deathSaveInfo: { failCount: 0, successCount: 0 },
  abilities: [
    { name: 'con', score: 20, modifier: 5, save: 9 },
    { name: 'cha', score: 18, modifier: 4, save: 8 },
  ],
  castingInfo: {
    saveDcs: [{ value: 16, sources: ['Paladin'] }, { value: 17, sources: ['Sorcerer'] }],
    spellAttacks: [{ value: 9, sources: ['Paladin', 'Sorcerer'] }],
  },
  speeds: [{ name: 'Walking', distance: 30 }],
  senses: [{ name: 'Darkvision', distance: '60 ft.' }],
  resistances: [{ name: 'Poison' }],
  classes: [{ name: 'Paladin', level: 1, subclassName: null }, { name: 'Sorcerer', level: 8, subclassName: 'Wild Magic Sorcery' }],
  race: { name: 'Loxodon' },
  decorations: { avatar: { avatarUrl: 'https://example.test/a.jpeg' } },
};

describe('mapCharacterSummary', () => {
  it('takes DDB-computed AC, initiative, HP and stats as-is', () => {
    const snap = mapCharacterSummary(summary, 200);
    expect(snap.hp).toEqual({ current: 55, max: 110, temp: 0 });
    expect(snap.conditions).toEqual([{ name: 'Exhaustion', level: 1 }, { name: 'Restrained' }]);
    expect(snap.stats).toMatchObject({
      ac: 21,
      initBonus: 1,
      passive: { perception: 16, insight: 12, investigation: 11 },
      saves: { con: 9, cha: 8 },
      spellcasting: [
        { dc: 16, attack: 9, sources: ['Paladin'] },
        { dc: 17, attack: 9, sources: ['Sorcerer'] },
      ],
      senses: ['Darkvision 60 ft.'],
      resistances: ['Poison'],
      classes: 'Paladin 1 / Sorcerer (Wild Magic Sorcery) 8',
    });
  });

  it('merges slots and limited uses from the slower v5 sheet', () => {
    const sheet = mapCharacter(character, cfg, 100);
    const merged = mergePcSnapshot(mapCharacterSummary(summary, 200), sheet)!;
    expect(merged.stats?.ac).toBe(21);
    expect(merged.conditions).toEqual([{ name: 'Exhaustion', level: 1 }, { name: 'Restrained' }]); // newer summary wins
    expect(merged.spellSlots[0]).toEqual({ level: 1, max: 4, used: 1 });
    expect(merged.limitedUses).toEqual([{ name: 'Lay On Hands', max: 1, used: 0 }]);
    expect(merged.feats).toContain('Alert');
    expect(mergePcSnapshot(undefined, sheet)).toBe(sheet);
  });
});

describe('encounterToEvents', () => {
  it('adds PCs (DDB-linked, no local HP) and monsters with DDB HP; stat block attached once', () => {
    const sb = mapMonster(beholder2024, cfg);
    const events = encounterToEvents(
      {
        id: 'enc',
        name: 'Test',
        monsters: [
          { id: 5194923, uniqueId: 'u1', name: 'Beholder (A)', quantity: 1, currentHitPoints: 150, maximumHitPoints: 190, temporaryHitPoints: 0, initiative: null },
          { id: 5194923, uniqueId: 'u2', name: 'Beholder (B)', quantity: 1, currentHitPoints: 190, maximumHitPoints: 190, temporaryHitPoints: 0, initiative: null },
        ],
        players: [{ id: '42', name: 'Hero', level: 5, type: 'CHARACTER_TYPE_DDB', hidden: false, initiative: 14 }],
      },
      { 5194923: sb },
    );
    expect(events).toHaveLength(3);
    const [pc, m1, m2] = events as any[];
    expect(pc.combatant).toMatchObject({ id: 'pc-42', kind: 'pc', hp: null, source: { ddbCharacterId: 42 }, initiative: null });
    expect(m1.combatant.hp).toEqual({ current: 150, max: 190, temp: 0 });
    expect(m1.statBlock).toBeDefined();
    expect(m2.statBlock).toBeUndefined();
  });
});

describe('difficulty', () => {
  it('2014: matches the DMG multiplier rules', () => {
    // 6 PCs level 8, Beholder + 2 hoplites + deathlock = 4 monsters → ×2, minus one step for 6+ PCs → ×1.5
    const d = difficulty2014([8, 8, 8, 8, 8, 8], [10000, 1100, 1100, 1100]);
    expect(d.rawXp).toBe(13300);
    expect(d.multiplier).toBe(1.5);
    expect(d.rating).toBe('Deadly');
  });

  it('2024: budgets are caps', () => {
    expect(difficulty2024([5, 5, 5, 5], [2000]).rating).toBe('Low');
    expect(difficulty2024([5, 5, 5, 5], [3000]).rating).toBe('Moderate');
    expect(difficulty2024([5, 5, 5, 5], [4400]).rating).toBe('High');
    expect(difficulty2024([5, 5, 5, 5], [4401]).rating).toBe('Beyond High');
  });
});
