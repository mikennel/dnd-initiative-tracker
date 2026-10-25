/**
 * Shapes of D&D Beyond payloads (only the fields we use) and of our mapped domain objects.
 * See docs/ddb-api.md. These payloads are undocumented, so treat every field as optional-ish.
 */

// ---------- Raw DDB payloads ----------

export interface DdbMonster {
  id: number;
  name: string;
  isLegacy?: boolean;
  isHomebrew?: boolean;
  isLegendary?: boolean;
  isMythic?: boolean;
  hasLair?: boolean;
  sizeId: number;
  typeId: number;
  subTypes?: number[];
  alignmentId?: number | null;
  armorClass: number;
  armorClassDescription?: string | null;
  averageHitPoints: number;
  hitPointDice?: { diceCount: number; diceValue: number; fixedValue: number; diceString: string } | null;
  initiativeBonus?: number | null;
  passivePerception?: number | null;
  challengeRatingId: number;
  stats: { statId: number; value: number }[];
  savingThrows?: { statId: number; bonusModifier: number | null }[];
  skills?: { skillId: number; value: number; additionalBonus: number | null }[];
  senses?: { senseId: number; notes: string | null }[];
  movements?: { movementId: number; speed: number; notes: string | null }[];
  languageDescription?: string | null;
  languageNote?: string | null;
  damageAdjustments?: number[];
  conditionImmunities?: number[];
  specialTraitsDescription?: string | null;
  actionsDescription?: string | null;
  bonusActionsDescription?: string | null;
  reactionsDescription?: string | null;
  legendaryActionsDescription?: string | null;
  mythicActionsDescription?: string | null;
  lairDescription?: string | null;
  avatarUrl?: string | null;
  largeAvatarUrl?: string | null;
  basicAvatarUrl?: string | null;
  url?: string | null;
}

export interface DdbEncounter {
  id: string;
  name: string;
  campaign?: { id: number; name: string } | null;
  inProgress?: boolean;
  roundNum?: number;
  turnNum?: number;
  monsters: {
    id: number;
    uniqueId: string;
    name: string;
    groupId?: string;
    quantity: number;
    currentHitPoints: number | null;
    maximumHitPoints: number | null;
    temporaryHitPoints: number | null;
    initiative: number | null;
    notes?: string | null;
  }[];
  players: {
    id: string;
    name: string;
    level: number;
    type: string;
    hidden: boolean;
    initiative: number | null;
    avatarUrl?: string | null;
  }[];
  dateModified?: number;
  difficulty?: number;
}

export interface DdbModifier {
  type: string;
  subType: string;
  value: number | null;
  fixedValue: number | null;
  statId?: number | null;
  componentId?: number;
  isGranted?: boolean;
}

export interface DdbCharacter {
  id: number;
  name: string;
  username?: string;
  baseHitPoints: number;
  bonusHitPoints: number | null;
  overrideHitPoints: number | null;
  removedHitPoints: number;
  temporaryHitPoints: number | null;
  stats: { id: number; value: number | null }[];
  bonusStats: { id: number; value: number | null }[];
  overrideStats: { id: number; value: number | null }[];
  modifiers: Record<string, DdbModifier[]>;
  classes: {
    level: number;
    definition: {
      name: string;
      spellRules?: {
        multiClassSpellSlotDivisor?: number;
        multiClassSpellSlotRounding?: number;
        levelSpellSlots?: number[][];
        isRitualSpellCaster?: boolean;
      } | null;
    };
    subclassDefinition?: { name: string; spellRules?: { multiClassSpellSlotDivisor?: number; multiClassSpellSlotRounding?: number; levelSpellSlots?: number[][] } | null } | null;
  }[];
  inventory?: { equipped: boolean; isAttuned: boolean; definition: { id: number; name: string; canAttune?: boolean } }[];
  conditions?: { id: number; level: number | null }[];
  deathSaves?: { failCount: number | null; successCount: number | null; isStabilized: boolean };
  spellSlots?: { level: number; used: number; available: number }[];
  pactMagic?: { level: number; used: number; available: number }[];
  feats?: { definition?: { name: string } | null }[];
  actions?: Record<string, { name: string; limitedUse?: { maxUses: number; numberUsed: number; resetType?: number } | null }[] | null>;
  decorations?: { avatarUrl?: string | null } | null;
  avatarUrl?: string | null;
  campaign?: { id: number; name: string } | null;
}

// ---------- Mapped domain objects ----------

export interface MonsterAbilityScores {
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
}

export interface StatBlockSection {
  /** Sanitized HTML from DDB. */
  html: string;
  features: StatBlockFeature[];
}

export interface StatBlockFeature {
  name: string;
  /** Plain-text description. */
  text: string;
}

export interface MonsterStatBlock {
  id: string;
  ddbId?: number;
  name: string;
  isLegacy: boolean;
  isHomebrew: boolean;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  acNote: string;
  hp: number;
  hpDice: string;
  speed: string;
  abilities: MonsterAbilityScores;
  saves: string;
  skills: string;
  senses: string;
  passivePerception: number | null;
  languages: string;
  cr: string;
  crValue: number;
  xp: number;
  proficiencyBonus: number;
  initBonus: number;
  vulnerabilities: string;
  resistances: string;
  immunities: string;
  conditionImmunities: string;
  sections: {
    traits?: StatBlockSection;
    actions?: StatBlockSection;
    bonusActions?: StatBlockSection;
    reactions?: StatBlockSection;
    legendary?: StatBlockSection;
    mythic?: StatBlockSection;
    lair?: StatBlockSection;
  };
  avatarUrl: string | null;
  ddbUrl: string | null;
}

/** Live PC state polled from a DDB character sheet (ADR 0003). Never event-sourced. */
export interface PcSnapshot {
  characterId: number;
  name: string;
  level: number;
  hp: { current: number; max: number; temp: number };
  conditions: { name: string; level?: number }[];
  deathSaves: { fail: number; success: number; stable: boolean };
  spellSlots: { level: number; max: number; used: number }[];
  pactSlots: { level: number; max: number; used: number }[];
  limitedUses: { name: string; max: number; used: number }[];
  /** Feat names from the v5 sheet (e.g. "Alert" for the lineup's initiative swap). */
  feats?: string[];
  avatarUrl: string | null;
  /** Epoch ms of the successful fetch. */
  fetchedAt: number;
  /** Precomputed stats from the scds summary endpoint. Absent if only the v5 sheet was read. */
  stats?: PcStats;
}

export interface PcStats {
  ac: number;
  initBonus: number;
  proficiencyBonus: number;
  passive: { perception: number; insight: number; investigation: number };
  /** Saving throw totals, keyed str..cha. */
  saves: Record<string, number>;
  /** One entry per distinct DC, e.g. a Paladin/Sorcerer has two. */
  spellcasting: { dc: number; attack: number | null; sources: string[] }[];
  speeds: string[];
  senses: string[];
  resistances: string[];
  immunities: string[];
  vulnerabilities: string[];
  classes: string;
  race: string;
  inspiration: boolean;
}

/** `POST character-service-scds.dndbeyond.com/v2/characters` result (docs/ddb-api.md). */
export interface DdbCharacterSummary {
  characterId: number;
  name: string;
  level: number;
  armorClass: number;
  initiativeBonus: number;
  proficiencyBonus?: number;
  passivePerception?: number;
  passiveInsight?: number;
  passiveInvestigation?: number;
  hitPointInfo: { maximum: number; current: number; temp: number | null };
  conditions?: { name: string; level: number | null }[];
  deathSaveInfo?: { failCount: number; successCount: number; isStabilized?: boolean };
  abilities?: { name: string; score: number; modifier: number; save: number }[];
  castingInfo?: {
    saveDcs?: { value: number; sources: string[] }[];
    spellAttacks?: { value: number; sources: string[] }[];
  };
  speeds?: { name: string; distance: number }[];
  senses?: { name: string; distance: string }[];
  resistances?: { name: string }[];
  immunities?: { name: string }[];
  vulnerabilities?: { name: string }[];
  classes?: { name: string; level: number; subclassName: string | null }[];
  race?: { name: string } | null;
  inspiration?: boolean;
  decorations?: { avatar?: { avatarUrl?: string | null } | null } | null;
}

export interface DdbCharacterSummaryResponse {
  foundCharacters: DdbCharacterSummary[];
  queuedIds?: number[];
  notFoundIds?: number[];
}
