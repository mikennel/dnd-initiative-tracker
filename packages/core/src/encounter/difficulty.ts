/** Encounter difficulty under both the 2014 DMG and the 2024 DMG rules. */

// 2014 DMG: XP thresholds per character level [easy, medium, hard, deadly]
const THRESHOLDS_2014: Record<number, [number, number, number, number]> = {
  1: [25, 50, 75, 100], 2: [50, 100, 150, 200], 3: [75, 150, 225, 400], 4: [125, 250, 375, 500],
  5: [250, 500, 750, 1100], 6: [300, 600, 900, 1400], 7: [350, 750, 1100, 1700], 8: [450, 900, 1400, 2100],
  9: [550, 1100, 1600, 2400], 10: [600, 1200, 1900, 2800], 11: [800, 1600, 2400, 3600], 12: [1000, 2000, 3000, 4500],
  13: [1100, 2200, 3400, 5100], 14: [1250, 2500, 3800, 5700], 15: [1400, 2800, 4300, 6400], 16: [1600, 3200, 4800, 7200],
  17: [2000, 3900, 5900, 8800], 18: [2100, 4200, 6300, 9500], 19: [2400, 4900, 7300, 10900], 20: [2800, 5700, 8500, 12700],
};

// 2024 DMG: XP budget per character [low, moderate, high]
const BUDGET_2024: Record<number, [number, number, number]> = {
  1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100],
  6: [600, 1000, 1400], 7: [750, 1300, 1700], 8: [1000, 1700, 2100], 9: [1300, 2000, 2600], 10: [1600, 2300, 3100],
  11: [1900, 2900, 4100], 12: [2200, 3700, 4700], 13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800],
  16: [3800, 6100, 9800], 17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000],
};

const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

function multiplierIndex(monsterCount: number): number {
  if (monsterCount <= 1) return 1;
  if (monsterCount === 2) return 2;
  if (monsterCount <= 6) return 3;
  if (monsterCount <= 10) return 4;
  if (monsterCount <= 14) return 5;
  return 6;
}

const clampLevel = (l: number) => Math.min(20, Math.max(1, Math.round(l)));

export interface Difficulty2014 {
  rating: 'Trivial' | 'Easy' | 'Medium' | 'Hard' | 'Deadly';
  rawXp: number;
  adjustedXp: number;
  multiplier: number;
  thresholds: { easy: number; medium: number; hard: number; deadly: number };
}

export function difficulty2014(partyLevels: number[], monsterXp: number[]): Difficulty2014 {
  const thresholds = { easy: 0, medium: 0, hard: 0, deadly: 0 };
  for (const lvl of partyLevels) {
    const [e, m, h, d] = THRESHOLDS_2014[clampLevel(lvl)];
    thresholds.easy += e; thresholds.medium += m; thresholds.hard += h; thresholds.deadly += d;
  }
  const rawXp = monsterXp.reduce((a, b) => a + b, 0);
  let idx = multiplierIndex(monsterXp.filter((x) => x > 0).length);
  if (partyLevels.length < 3) idx += 1;
  else if (partyLevels.length >= 6) idx -= 1;
  const multiplier = MULTIPLIERS[Math.min(MULTIPLIERS.length - 1, Math.max(0, idx))];
  const adjustedXp = Math.round(rawXp * multiplier);
  const rating =
    adjustedXp >= thresholds.deadly ? 'Deadly' : adjustedXp >= thresholds.hard ? 'Hard' : adjustedXp >= thresholds.medium ? 'Medium' : adjustedXp >= thresholds.easy ? 'Easy' : 'Trivial';
  return { rating, rawXp, adjustedXp, multiplier, thresholds };
}

export interface Difficulty2024 {
  /** Budgets are spending caps: up to `low` is Low, up to `moderate` is Moderate, etc. */
  rating: 'Low' | 'Moderate' | 'High' | 'Beyond High';
  xp: number;
  budget: { low: number; moderate: number; high: number };
}

export function difficulty2024(partyLevels: number[], monsterXp: number[]): Difficulty2024 {
  const budget = { low: 0, moderate: 0, high: 0 };
  for (const lvl of partyLevels) {
    const [l, m, h] = BUDGET_2024[clampLevel(lvl)];
    budget.low += l; budget.moderate += m; budget.high += h;
  }
  const xp = monsterXp.reduce((a, b) => a + b, 0);
  const rating = xp > budget.high ? 'Beyond High' : xp > budget.moderate ? 'High' : xp > budget.low ? 'Moderate' : 'Low';
  return { rating, xp, budget };
}
