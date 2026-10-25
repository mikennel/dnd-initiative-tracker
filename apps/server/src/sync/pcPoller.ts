import { mergePcSnapshot, type PcSnapshot } from '@dnd/core';
import type { Kv } from '../store/db.ts';
import type { DdbClient } from '../ddb/client.ts';

/**
 * Polls DDB for PCs in combats that someone is currently viewing, and reports changes
 * (ADR 0003). DDB has no live feed for sheet changes (docs/ddb-api.md, "Live updates"),
 * so polling is the mechanism, not a stopgap.
 */
export class PcPoller {
  readonly snapshots = new Map<number, PcSnapshot>();
  readonly errors = new Map<number, string>();
  private summaries = new Map<number, PcSnapshot>();
  private sheets = new Map<number, PcSnapshot>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private failures = 0;

  constructor(
    private ddb: DdbClient,
    private kv: Kv,
    private watched: () => Set<number>,
    private onUpdate: (snaps: PcSnapshot[], changed: PcSnapshot[]) => void,
    private intervalMs = 6000,
    private sheetEveryMs = 30_000,
  ) {
    // Restore last-known values so PCs show something even if DDB is unreachable after a restart.
    for (const snap of kv.get<PcSnapshot[]>('pc:last') ?? []) this.snapshots.set(snap.characterId, snap);
  }

  start() {
    if (this.timer) return;
    const loop = async () => {
      await this.tick();
      // Back off up to 1 minute while DDB is failing.
      const delay = Math.min(60_000, this.intervalMs * 2 ** Math.min(this.failures, 4));
      this.timer = setTimeout(loop, delay);
    };
    this.timer = setTimeout(loop, 500);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * One poll. Each tick reads all summaries in a single scds request (HP, conditions, AC,
   * initiative). Full v5 sheets (spell slots, limited uses) are read every `sheetEveryMs`,
   * and every tick for characters the summary didn't return or when scds fails.
   */
  async tick(only?: number[]): Promise<void> {
    if (this.running) return;
    if (this.ddb.status === 'unconfigured' || this.ddb.status === 'auth-failed') return;
    const ids = only ?? [...this.watched()];
    if (ids.length === 0) return;
    this.running = true;
    const changed: PcSnapshot[] = [];
    let failed = false;
    try {
      let needSheet = ids;
      try {
        const { found, missing } = await this.ddb.getCharacterSummaries(ids);
        for (const snap of found) this.summaries.set(snap.characterId, snap);
        const now = Date.now();
        needSheet = only ?? ids.filter((id) => missing.includes(id) || now - (this.sheets.get(id)?.fetchedAt ?? 0) >= this.sheetEveryMs);
      } catch (err) {
        // Fall back to per-character sheets; previous AC/initiative stay until scds recovers.
        for (const id of ids) this.errors.set(id, `summary: ${String((err as Error)?.message ?? err)}`);
      }
      const results = await Promise.allSettled(needSheet.map((id) => this.ddb.getCharacter(id)));
      results.forEach((r, i) => {
        const id = needSheet[i];
        if (r.status === 'fulfilled') this.sheets.set(id, r.value);
        else {
          failed = true;
          this.errors.set(id, String(r.reason?.message ?? r.reason));
        }
      });
      for (const id of ids) {
        const merged = mergePcSnapshot(this.summaries.get(id), this.sheets.get(id));
        if (!merged) continue;
        const prev = this.snapshots.get(id);
        this.snapshots.set(id, merged);
        if (!failed) this.errors.delete(id);
        if (!prev || !sameSnapshot(prev, merged)) changed.push(merged);
      }
    } finally {
      this.running = false;
    }
    this.failures = failed ? this.failures + 1 : 0;
    if (changed.length) this.kv.set('pc:last', [...this.snapshots.values()]);
    const fresh = ids.map((id) => this.snapshots.get(id)).filter((s): s is PcSnapshot => !!s);
    this.onUpdate(fresh, changed);
  }

  get(ids: Iterable<number>): Record<number, PcSnapshot> {
    const out: Record<number, PcSnapshot> = {};
    for (const id of ids) {
      const s = this.snapshots.get(id);
      if (s) out[id] = s;
    }
    return out;
  }
}

function sameSnapshot(a: PcSnapshot, b: PcSnapshot): boolean {
  // fetchedAt changes every poll; only real sheet changes count.
  return JSON.stringify({ ...a, fetchedAt: 0 }) === JSON.stringify({ ...b, fetchedAt: 0 });
}
