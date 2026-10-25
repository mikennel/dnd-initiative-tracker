/** The standard 5e conditions, plus common table shorthands. DMs can also add free-text custom ones. */
export interface ConditionInfo {
  key: string;
  name: string;
  summary: string;
  hasLevels?: boolean;
}

export const STANDARD_CONDITIONS: ConditionInfo[] = [
  { key: 'blinded', name: 'Blinded', summary: "Can't see; attacks against have advantage; its attacks have disadvantage." },
  { key: 'charmed', name: 'Charmed', summary: "Can't attack the charmer; charmer has advantage on social checks." },
  { key: 'deafened', name: 'Deafened', summary: "Can't hear." },
  { key: 'exhaustion', name: 'Exhaustion', summary: 'd20 tests reduced by 2 × level (2024). Death at level 6.', hasLevels: true },
  { key: 'frightened', name: 'Frightened', summary: "Disadvantage on checks/attacks while source in sight; can't move closer." },
  { key: 'grappled', name: 'Grappled', summary: 'Speed 0; disadvantage on attacks against targets other than the grappler.' },
  { key: 'incapacitated', name: 'Incapacitated', summary: 'No actions, bonus actions or reactions; concentration ends.' },
  { key: 'invisible', name: 'Invisible', summary: 'Attacks against have disadvantage; its attacks have advantage.' },
  { key: 'paralyzed', name: 'Paralyzed', summary: 'Incapacitated, speed 0, fails STR/DEX saves; hits within 5 ft are crits.' },
  { key: 'petrified', name: 'Petrified', summary: 'Turned to stone; incapacitated; resistance to all damage.' },
  { key: 'poisoned', name: 'Poisoned', summary: 'Disadvantage on attack rolls and ability checks.' },
  { key: 'prone', name: 'Prone', summary: 'Melee attacks against have advantage; ranged have disadvantage.' },
  { key: 'restrained', name: 'Restrained', summary: 'Speed 0; attacks against have advantage; disadvantage on DEX saves.' },
  { key: 'stunned', name: 'Stunned', summary: 'Incapacitated; fails STR/DEX saves; attacks against have advantage.' },
  { key: 'unconscious', name: 'Unconscious', summary: 'Incapacitated, prone, drops items; hits within 5 ft are crits.' },
];

/** Non-standard but common effects worth one-click access. */
export const QUICK_EFFECTS: ConditionInfo[] = [
  { key: 'sapped', name: 'Sapped', summary: 'Disadvantage on next attack roll before your next turn (Sap mastery).' },
  { key: 'slowed', name: 'Slowed', summary: 'Speed reduced by 10 ft (Slow mastery).' },
  { key: 'vexed', name: 'Vexed', summary: 'Next attack against it has advantage (Vex mastery).' },
  { key: 'blessed', name: 'Blessed', summary: '+1d4 to attack rolls and saves.' },
  { key: 'baned', name: 'Baned', summary: '−1d4 to attack rolls and saves.' },
  { key: 'hasted', name: 'Hasted', summary: '+2 AC, advantage on DEX saves, extra action.' },
  { key: 'dodging', name: 'Dodging', summary: 'Attacks against have disadvantage; advantage on DEX saves.' },
  { key: 'hidden', name: 'Hidden', summary: 'Unseen and unheard.' },
  { key: 'raging', name: 'Raging', summary: 'Resistance to B/P/S; bonus to STR damage.' },
  { key: 'marked', name: "Hunter's Mark / Hex", summary: 'Extra damage from the caster.' },
  { key: 'faerie-fire', name: 'Faerie Fire', summary: 'Attacks against have advantage; no invisibility.' },
];

export function conditionKeyFromName(name: string): string {
  const lower = name.trim().toLowerCase();
  const std = [...STANDARD_CONDITIONS, ...QUICK_EFFECTS].find((c) => c.name.toLowerCase() === lower);
  return std?.key ?? 'custom';
}
