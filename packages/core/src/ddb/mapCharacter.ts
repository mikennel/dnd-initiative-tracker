import { abilityMod } from '../dice.ts';
import { byId, type DdbConfig } from './config.ts';
import type { DdbCharacter, DdbModifier, PcSnapshot } from './types.ts';

const CON = 3;

/**
 * Modifiers that are actually active: item modifiers only count when the item is equipped
 * (and attuned, if it requires attunement). See docs/ddb-api.md#characters.
 */
export function activeModifiers(c: DdbCharacter): DdbModifier[] {
  const out: DdbModifier[] = [];
  for (const [source, mods] of Object.entries(c.modifiers ?? {})) {
    for (const m of mods ?? []) {
      if (source === 'item') {
        const item = c.inventory?.find((i) => i.definition.id === m.componentId);
        if (!item || !item.equipped || (item.definition.canAttune && !item.isAttuned)) continue;
      }
      out.push(m);
    }
  }
  return out;
}

const modValue = (m: DdbModifier) => m.value ?? m.fixedValue ?? 0;

export function abilityScore(c: DdbCharacter, statId: number, mods = activeModifiers(c)): number {
  const override = c.overrideStats?.find((s) => s.id === statId)?.value;
  if (override) return override;
  const key = ['', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'][statId];
  let score = (c.stats.find((s) => s.id === statId)?.value ?? 10) + (c.bonusStats?.find((s) => s.id === statId)?.value ?? 0);
  for (const m of mods) if (m.type === 'bonus' && m.subType === `${key}-score`) score += modValue(m);
  for (const m of mods) if (m.type === 'set' && m.subType === `${key}-score`) score = Math.max(score, modValue(m));
  return score;
}

export function totalLevel(c: DdbCharacter): number {
  return c.classes.reduce((sum, k) => sum + k.level, 0);
}

export function characterHp(c: DdbCharacter): { current: number; max: number; temp: number } {
  const mods = activeModifiers(c);
  const level = totalLevel(c);
  let max: number;
  if (c.overrideHitPoints) {
    max = c.overrideHitPoints;
  } else {
    const conMod = abilityMod(abilityScore(c, CON, mods));
    const perLevel = mods.filter((m) => m.type === 'bonus' && m.subType === 'hit-points-per-level').reduce((a, m) => a + modValue(m), 0);
    const flat = mods.filter((m) => m.type === 'bonus' && m.subType === 'hit-points').reduce((a, m) => a + modValue(m), 0);
    max = c.baseHitPoints + (c.bonusHitPoints ?? 0) + conMod * level + perLevel * level + flat;
  }
  return { max, current: Math.max(0, max - (c.removedHitPoints ?? 0)), temp: c.temporaryHitPoints ?? 0 };
}

/** Spell slot maximums: single-class uses the class table; multiclass uses the shared caster-level table. */
export function spellSlotMax(c: DdbCharacter, cfg: DdbConfig): number[] {
  const casters = c.classes
    .filter((k) => k.definition.name !== 'Warlock')
    .map((k) => {
      const rules = k.definition.spellRules?.multiClassSpellSlotDivisor ? k.definition.spellRules : k.subclassDefinition?.spellRules;
      const table = rules?.levelSpellSlots;
      const hasSlots = !!table?.some((row) => row?.some((n) => n > 0));
      return hasSlots && rules?.multiClassSpellSlotDivisor ? { level: k.level, rules: rules!, table: table! } : null;
    })
    .filter((x) => x !== null);
  if (casters.length === 0) return [];
  if (casters.length === 1) return casters[0].table[casters[0].level] ?? [];
  const casterLevel = casters.reduce((sum, k) => {
    const raw = k.level / k.rules.multiClassSpellSlotDivisor!;
    return sum + (k.rules.multiClassSpellSlotRounding === 2 ? Math.ceil(raw) : Math.floor(raw));
  }, 0);
  return cfg.multiClassSpellSlots[Math.min(casterLevel, cfg.multiClassSpellSlots.length - 1)] ?? [];
}

function pactSlotMax(c: DdbCharacter): number[] {
  const warlock = c.classes.find((k) => k.definition.name === 'Warlock');
  return warlock?.definition.spellRules?.levelSpellSlots?.[warlock.level] ?? [];
}

export function mapCharacter(c: DdbCharacter, cfg: DdbConfig, fetchedAt = Date.now()): PcSnapshot {
  const slotMax = spellSlotMax(c, cfg);
  const pactMax = pactSlotMax(c);
  const toSlots = (max: number[], used: { level: number; used: number }[] | undefined) =>
    max
      .map((n, i) => ({ level: i + 1, max: n, used: used?.find((s) => s.level === i + 1)?.used ?? 0 }))
      .filter((s) => s.max > 0);

  const limitedUses = Object.values(c.actions ?? {})
    .flatMap((list) => list ?? [])
    .filter((a) => a.limitedUse && a.limitedUse.maxUses > 0)
    .map((a) => ({ name: a.name, max: a.limitedUse!.maxUses, used: a.limitedUse!.numberUsed ?? 0 }));

  return {
    characterId: c.id,
    name: c.name,
    level: totalLevel(c),
    hp: characterHp(c),
    conditions: (c.conditions ?? []).map((x) => {
      const def = byId(cfg.conditions, x.id);
      return x.level ? { name: def?.name ?? `Condition ${x.id}`, level: x.level } : { name: def?.name ?? `Condition ${x.id}` };
    }),
    deathSaves: {
      fail: c.deathSaves?.failCount ?? 0,
      success: c.deathSaves?.successCount ?? 0,
      stable: !!c.deathSaves?.isStabilized,
    },
    spellSlots: toSlots(slotMax, c.spellSlots),
    pactSlots: toSlots(pactMax, c.pactMagic),
    limitedUses,
    avatarUrl: c.decorations?.avatarUrl ?? c.avatarUrl ?? null,
    fetchedAt,
  };
}
