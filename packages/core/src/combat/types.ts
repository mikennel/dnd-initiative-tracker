import type { MonsterStatBlock } from '../ddb/types.ts';

export type CombatantKind = 'pc' | 'monster' | 'npc' | 'effect';

export interface HitPoints {
  current: number;
  max: number;
  temp: number;
}

/** When a condition's duration ticks down. Anchored to a combatant's turn (often the source's). */
export type ConditionDuration =
  | { kind: 'rounds'; rounds: number; tick: 'start' | 'end'; anchorId: string }
  | { kind: 'saveEnds'; ability: AbilityKey; dc: number; tick: 'start' | 'end' }
  | { kind: 'manual' };

export interface CombatCondition {
  id: string;
  /** Standard condition key ('stunned', 'exhaustion', ...) or 'custom'. */
  key: string;
  name: string;
  /** Exhaustion level, etc. */
  level?: number;
  sourceId?: string;
  duration: ConditionDuration;
  note?: string;
}

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export type ResourceReset = 'turnStart' | 'shortRest' | 'longRest' | 'day' | 'never';

export type Resource =
  | { id: string; kind: 'recharge'; name: string; min: number; charged: boolean; lastRoll?: number }
  | { id: string; kind: 'uses'; name: string; max: number; used: number; reset: ResourceReset; note?: string }
  | { id: string; kind: 'slots'; name: string; slots: { level: number; max: number; used: number }[] };

export interface Combatant {
  id: string;
  kind: CombatantKind;
  name: string;
  initiative: number | null;
  initBonus: number;
  /** Set by an Alert swap so two tied combatants really trade places; checked right after initiative. */
  tiebreak?: number;
  /** Secondary tiebreak (dex score), then insertion order. */
  dex?: number;
  ac: number | null;
  hp: HitPoints | null;
  hidden: boolean;
  defeated: boolean;
  conditions: CombatCondition[];
  concentration: string | null;
  resources: Resource[];
  notes: string;
  source?: { ddbMonsterId?: number; ddbCharacterId?: number };
  /** Group label for monsters of the same type ("Setessan Hoplite"). */
  group?: string;
  avatarUrl?: string;
  /** Environment/lair effects: optional countdown, decremented at the start of the effect's turn. */
  roundsRemaining?: number;
  description?: string;
  order: number;
}

export type PromptKind = 'concentration' | 'recharge' | 'save' | 'expired' | 'effect';

export interface CombatPrompt {
  id: string;
  kind: PromptKind;
  combatantId: string;
  text: string;
  dc?: number;
  ability?: AbilityKey;
  resourceId?: string;
  conditionId?: string;
}

export interface CombatSettings {
  showMonsterHealth: boolean;
  skipDefeated: boolean;
  rules: '2014' | '2024';
}

export interface LogEntry {
  round: number;
  text: string;
}

export interface CombatState {
  id: string;
  name: string;
  campaign: { id: number; name: string } | null;
  sourceEncounterId: string | null;
  combatants: Record<string, Combatant>;
  started: boolean;
  /** Not started yet, but the table view shows the players their initiative order (Alert swaps). */
  lineup: boolean;
  round: number;
  activeId: string | null;
  prompts: CombatPrompt[];
  settings: CombatSettings;
  /** Monster stat blocks referenced by combatants, keyed by DDB monster id (or local id). */
  statBlocks: Record<string, MonsterStatBlock>;
  log: LogEntry[];
  nextOrder: number;
}

export const DEFAULT_SETTINGS: CombatSettings = {
  showMonsterHealth: true,
  skipDefeated: true,
  rules: '2024',
};
