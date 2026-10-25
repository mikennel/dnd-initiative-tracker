/** Dice helpers. Randomness lives here, at the edges, and never inside the reducer (ADR 0002). */

export type Rng = () => number;

export function rollDie(sides: number, rng: Rng = Math.random): number {
  return 1 + Math.floor(rng() * sides);
}

export function rollD20(bonus = 0, rng: Rng = Math.random): { roll: number; total: number } {
  const roll = rollDie(20, rng);
  return { roll, total: roll + bonus };
}

/** Roll an expression like "2d6+3", "1d20 - 1" or "20d10 + 80". Returns null when unparseable. */
export function rollExpression(expr: string, rng: Rng = Math.random): { total: number; rolls: number[] } | null {
  const m = /^\s*(\d*)d(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(expr);
  if (!m) return null;
  const count = Number(m[1] || 1);
  const sides = Number(m[2]);
  const mod = m[4] ? Number(m[4]) * (m[3] === '-' ? -1 : 1) : 0;
  const rolls = Array.from({ length: count }, () => rollDie(sides, rng));
  return { total: rolls.reduce((a, b) => a + b, 0) + mod, rolls };
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}
