import type { PcSnapshot } from '@dnd/core';
import type { Kv } from '../store/db.ts';
import type { DdbClient } from '../ddb/client.ts';

/**
 * Polls DDB character sheets for PCs in combats that someone is currently viewing, and
 * reports changes (ADR 0003). Polling a handful of characters every few seconds is cheap.
 * The game-log websocket could replace this later (docs/ddb-api.md#live-updates-unverified).
 */
export class PcPoller {
  readonly snapshots = new Map<number, PcSnapshot>();
  readonly errors = new Map<number, string>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private failures = 0;

  constructor(
    private ddb: DdbClient,
    private kv: Kv,
    private watched: () => Set<number>,
    private onUpdate: (snaps: PcSnapshot[], changed: PcSnapshot[]) => void,
    private intervalMs = 6000,
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

  /** Fetch now (e.g. right after a combat is imported). */
  async tick(only?: number[]): Promise<void> {
    if (this.running) return;
    if (this.ddb.status === 'unconfigured' || this.ddb.status === 'auth-failed') return;
    const ids = only ?? [...this.watched()];
    if (ids.length === 0) return;
    this.running = true;
    const changed: PcSnapshot[] = [];
    let failed = false;
    try {
      const results = await Promise.allSettled(ids.map((id) => this.ddb.getCharacter(id)));
      results.forEach((r, i) => {
        const id = ids[i];
        if (r.status === 'fulfilled') {
          const prev = this.snapshots.get(id);
          this.snapshots.set(id, r.value);
          this.errors.delete(id);
          if (!prev || !sameSnapshot(prev, r.value)) changed.push(r.value);
        } else {
          failed = true;
          this.errors.set(id, String(r.reason?.message ?? r.reason));
        }
      });
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
  return JSON.stringify({ ...a, fetchedAt: 0 }) === JSON.stringify({ ...b, fetchedAt: 0 });
}
