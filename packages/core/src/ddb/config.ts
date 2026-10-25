/** Slimmed copy of DDB's public `/api/config/json` lookup tables (docs/ddb-api.md#config). */
export interface DdbConfig {
  challengeRatings: { id: number; value: number; xp: number; proficiencyBonus: number }[];
  conditions: { id: number; name: string; type: number }[];
  creatureSizes: { id: number; name: string }[];
  monsterTypes: { id: number; name: string }[];
  damageAdjustments: { id: number; name: string; type: number }[];
  senses: { id: number; name: string }[];
  movements: { id: number; name: string }[];
  stats: { id: number; key: string; name: string }[];
  abilitySkills: { id: number; name: string; stat: number }[];
  alignments: { id: number; name: string }[];
  multiClassSpellSlots: number[][];
  pactMagicMultiClassSpellSlots?: number[][];
}

/** Reduce the ~600 KB raw config to just the tables we use (~12 KB). */
export function slimConfig(raw: any): DdbConfig {
  const pick = <K extends string>(arr: any[] | undefined, keys: K[]) =>
    (arr ?? []).map((x) => Object.fromEntries(keys.map((k) => [k, x[k]]))) as any[];
  return {
    challengeRatings: pick(raw.challengeRatings, ['id', 'value', 'xp', 'proficiencyBonus']),
    conditions: (raw.conditions ?? []).map((x: any) => ({ id: x.definition.id, name: x.definition.name, type: x.definition.type })),
    creatureSizes: pick(raw.creatureSizes, ['id', 'name']),
    monsterTypes: pick(raw.monsterTypes, ['id', 'name']),
    damageAdjustments: pick(raw.damageAdjustments, ['id', 'name', 'type']),
    senses: pick(raw.senses, ['id', 'name']),
    movements: pick(raw.movements, ['id', 'name']),
    stats: pick(raw.stats, ['id', 'key', 'name']),
    abilitySkills: pick(raw.abilitySkills, ['id', 'name', 'stat']),
    alignments: pick(raw.alignments, ['id', 'name']),
    multiClassSpellSlots: raw.multiClassSpellSlots ?? [],
    pactMagicMultiClassSpellSlots: raw.pactMagicMultiClassSpellSlots ?? [],
  };
}

export function byId<T extends { id: number }>(arr: T[], id: number | null | undefined): T | undefined {
  return id == null ? undefined : arr.find((x) => x.id === id);
}

export function crLabel(value: number): string {
  if (value === 0.125) return '1/8';
  if (value === 0.25) return '1/4';
  if (value === 0.5) return '1/2';
  return String(value);
}
