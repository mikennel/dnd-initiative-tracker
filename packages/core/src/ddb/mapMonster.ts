import type { NewCombatant } from '../combat/events.ts';
import { abilityMod, rollExpression, signed, type Rng } from '../dice.ts';
import { byId, crLabel, type DdbConfig } from './config.ts';
import { extractResources, parseSection } from './parseStatBlock.ts';
import type { DdbMonster, MonsterAbilityScores, MonsterStatBlock } from './types.ts';

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
/** DDB damageAdjustments[].type */
const ADJ = { resistance: 1, immunity: 2, vulnerability: 3 } as const;

export function mapMonster(m: DdbMonster, cfg: DdbConfig): MonsterStatBlock {
  const abilities = Object.fromEntries(ABILITY_KEYS.map((k, i) => [k, m.stats.find((s) => s.statId === i + 1)?.value ?? 10])) as unknown as MonsterAbilityScores;
  const cr = byId(cfg.challengeRatings, m.challengeRatingId);
  const pb = cr?.proficiencyBonus ?? 2;
  const statKey = (statId: number) => ABILITY_KEYS[statId - 1];

  const speed = [...(m.movements ?? [])]
    .sort((a, b) => a.movementId - b.movementId)
    .map((mv) => {
      const name = byId(cfg.movements, mv.movementId)?.name ?? '';
      const base = mv.movementId === 1 ? `${mv.speed} ft.` : `${name.toLowerCase()} ${mv.speed} ft.`;
      return mv.notes ? `${base} ${mv.notes}` : base;
    })
    .join(', ');

  const saves = (m.savingThrows ?? [])
    .map((s) => {
      const key = statKey(s.statId);
      const bonus = abilityMod(abilities[key]) + pb + (s.bonusModifier ?? 0);
      return `${key[0].toUpperCase()}${key.slice(1)} ${signed(bonus)}`;
    })
    .join(', ');

  const skills = (m.skills ?? [])
    .map((s) => `${byId(cfg.abilitySkills, s.skillId)?.name ?? `Skill ${s.skillId}`} ${signed(s.value + (s.additionalBonus ?? 0))}`)
    .join(', ');

  const senses = [
    ...(m.senses ?? []).map((s) => `${byId(cfg.senses, s.senseId)?.name ?? ''} ${s.notes ?? ''}`.trim()),
    m.passivePerception != null ? `Passive Perception ${m.passivePerception}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const adj = (type: number) =>
    (m.damageAdjustments ?? [])
      .map((id) => byId(cfg.damageAdjustments, id))
      .filter((a) => a && a.type === type)
      .map((a) => a!.name)
      .join(', ');

  const sb: MonsterStatBlock = {
    id: `ddb-${m.id}`,
    ddbId: m.id,
    name: m.name,
    isLegacy: !!m.isLegacy,
    isHomebrew: !!m.isHomebrew,
    size: byId(cfg.creatureSizes, m.sizeId)?.name ?? '',
    type: byId(cfg.monsterTypes, m.typeId)?.name ?? '',
    alignment: byId(cfg.alignments, m.alignmentId)?.name ?? '',
    ac: m.armorClass,
    acNote: m.armorClassDescription?.replace(/<[^>]+>/g, '').trim() ?? '',
    hp: m.averageHitPoints,
    hpDice: m.hitPointDice?.diceString ?? '',
    speed,
    abilities,
    saves,
    skills,
    senses,
    passivePerception: m.passivePerception ?? null,
    languages: [m.languageDescription, m.languageNote].filter(Boolean).join(' ') || '—',
    cr: cr ? crLabel(cr.value) : '?',
    crValue: cr?.value ?? 0,
    xp: cr?.xp ?? 0,
    proficiencyBonus: pb,
    initBonus: m.initiativeBonus ?? abilityMod(abilities.dex),
    vulnerabilities: adj(ADJ.vulnerability),
    resistances: adj(ADJ.resistance),
    immunities: adj(ADJ.immunity),
    conditionImmunities: (m.conditionImmunities ?? []).map((id) => byId(cfg.conditions, id)?.name ?? '').filter(Boolean).join(', '),
    sections: {
      traits: parseSection(m.specialTraitsDescription),
      actions: parseSection(m.actionsDescription),
      bonusActions: parseSection(m.bonusActionsDescription),
      reactions: parseSection(m.reactionsDescription),
      legendary: parseSection(m.legendaryActionsDescription),
      mythic: parseSection(m.mythicActionsDescription),
      lair: parseSection(m.lairDescription),
    },
    avatarUrl: m.avatarUrl || m.basicAvatarUrl || null,
    ddbUrl: m.url ?? null,
  };
  return sb;
}

export interface MonsterCombatantOptions {
  id: string;
  name?: string;
  hp?: 'average' | 'roll' | number;
  initiative?: number | null;
  hidden?: boolean;
  group?: string;
  rng?: Rng;
}

/** Build a combatant (with parsed resources) from a stat block. Dice are rolled here, never in the reducer. */
export function monsterToCombatant(sb: MonsterStatBlock, opts: MonsterCombatantOptions): NewCombatant {
  let maxHp = sb.hp;
  if (typeof opts.hp === 'number') maxHp = opts.hp;
  else if (opts.hp === 'roll' && sb.hpDice) maxHp = Math.max(1, rollExpression(sb.hpDice, opts.rng)?.total ?? sb.hp);
  return {
    id: opts.id,
    kind: 'monster',
    name: opts.name ?? sb.name,
    initiative: opts.initiative ?? null,
    initBonus: sb.initBonus,
    dex: sb.abilities.dex,
    ac: sb.ac,
    hp: { current: maxHp, max: maxHp, temp: 0 },
    hidden: opts.hidden ?? false,
    defeated: false,
    conditions: [],
    concentration: null,
    resources: extractResources(sb, opts.id),
    notes: '',
    source: sb.ddbId !== undefined ? { ddbMonsterId: sb.ddbId } : undefined,
    group: opts.group ?? sb.name,
    avatarUrl: sb.avatarUrl ?? undefined,
  };
}

/** "Goblin" ×3 → "Goblin (A)", "Goblin (B)", "Goblin (C)", matching DDB's naming. */
export function letterSuffix(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
