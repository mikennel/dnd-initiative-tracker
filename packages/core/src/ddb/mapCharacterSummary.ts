import type { DdbCharacterSummary, PcSnapshot, PcStats } from './types.ts';

/**
 * Map a scds character summary (docs/ddb-api.md#character-summaries). DDB has already applied
 * items, feats and class features, so AC, initiative and HP are taken as-is. Spell slots and
 * limited uses aren't in the summary; `mergePcSnapshot` fills them from the v5 sheet.
 */
export function mapCharacterSummary(s: DdbCharacterSummary, fetchedAt = Date.now()): PcSnapshot {
  return {
    characterId: s.characterId,
    name: s.name,
    level: s.level,
    hp: { current: s.hitPointInfo.current, max: s.hitPointInfo.maximum, temp: s.hitPointInfo.temp ?? 0 },
    conditions: (s.conditions ?? []).map((x) => (x.level ? { name: x.name, level: x.level } : { name: x.name })),
    deathSaves: {
      fail: s.deathSaveInfo?.failCount ?? 0,
      success: s.deathSaveInfo?.successCount ?? 0,
      stable: !!s.deathSaveInfo?.isStabilized,
    },
    spellSlots: [],
    pactSlots: [],
    limitedUses: [],
    avatarUrl: s.decorations?.avatar?.avatarUrl ?? null,
    fetchedAt,
    stats: summaryStats(s),
  };
}

function summaryStats(s: DdbCharacterSummary): PcStats {
  const names = (list?: { name: string }[]) => (list ?? []).map((x) => x.name);
  return {
    ac: s.armorClass,
    initBonus: s.initiativeBonus,
    proficiencyBonus: s.proficiencyBonus ?? 0,
    passive: { perception: s.passivePerception ?? 10, insight: s.passiveInsight ?? 10, investigation: s.passiveInvestigation ?? 10 },
    saves: Object.fromEntries((s.abilities ?? []).map((a) => [a.name, a.save])),
    spellcasting: (s.castingInfo?.saveDcs ?? []).map((dc) => ({
      dc: dc.value,
      attack: s.castingInfo?.spellAttacks?.find((a) => a.sources.some((src) => dc.sources.includes(src)))?.value ?? null,
      sources: dc.sources,
    })),
    speeds: (s.speeds ?? []).map((x) => `${x.name} ${x.distance} ft.`),
    senses: (s.senses ?? []).map((x) => `${x.name} ${x.distance}`),
    resistances: names(s.resistances),
    immunities: names(s.immunities),
    vulnerabilities: names(s.vulnerabilities),
    classes: (s.classes ?? []).map((k) => `${k.name}${k.subclassName ? ` (${k.subclassName})` : ''} ${k.level}`).join(' / '),
    race: s.race?.name ?? '',
    inspiration: !!s.inspiration,
  };
}

/**
 * Combine the fast summary (HP, conditions, stats) with the slower v5 sheet (slots, limited
 * uses). Either may be missing; the newer `fetchedAt` wins for the shared fields.
 */
export function mergePcSnapshot(summary: PcSnapshot | undefined, sheet: PcSnapshot | undefined): PcSnapshot | undefined {
  if (!summary) return sheet;
  if (!sheet) return summary;
  const base = summary.fetchedAt >= sheet.fetchedAt ? summary : sheet;
  return {
    ...base,
    avatarUrl: summary.avatarUrl ?? sheet.avatarUrl,
    spellSlots: sheet.spellSlots,
    pactSlots: sheet.pactSlots,
    limitedUses: sheet.limitedUses,
    feats: sheet.feats,
    stats: summary.stats,
  };
}
