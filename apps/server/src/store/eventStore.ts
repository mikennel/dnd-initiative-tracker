import { randomUUID } from 'node:crypto';
import { materialize, type CombatEvent, type CombatEventBody, type Materialized } from '@dnd/core';
import type { Db } from './db.ts';

export interface CombatSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  eventCount: number;
}

/**
 * Append-only combat event log (ADR 0002). Events are written synchronously before they are
 * acknowledged, so a crash loses nothing that a client was told is saved.
 */
export class EventStore {
  /** Materialized state cache, invalidated on append. */
  private cache = new Map<string, { seq: number; m: Materialized }>();

  constructor(private db: Db) {}

  createCombat(first: CombatEventBody & { type: 'combat/created' }, more: CombatEventBody[] = []): string {
    const id = randomUUID();
    const now = Date.now();
    this.db.prepare('INSERT INTO combats (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, first.name, now, now);
    const events: CombatEvent[] = [first, ...more].map((body) => ({ eventId: randomUUID(), ts: now, body }));
    this.append(id, events);
    return id;
  }

  listCombats(includeArchived = false): CombatSummary[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.name, c.created_at, c.updated_at, c.archived, (SELECT COUNT(*) FROM events e WHERE e.combat_id = c.id) AS n
         FROM combats c ${includeArchived ? '' : 'WHERE c.archived = 0'} ORDER BY c.updated_at DESC`,
      )
      .all() as { id: string; name: string; created_at: number; updated_at: number; archived: number; n: number }[];
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at, archived: !!r.archived, eventCount: r.n }));
  }

  exists(combatId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM combats WHERE id = ?').get(combatId);
  }

  events(combatId: string, afterSeq = 0): CombatEvent[] {
    const rows = this.db
      .prepare('SELECT seq, event_id, ts, body FROM events WHERE combat_id = ? AND seq > ? ORDER BY seq')
      .all(combatId, afterSeq) as { seq: number; event_id: string; ts: number; body: string }[];
    return rows.map((r) => ({ seq: r.seq, eventId: r.event_id, ts: r.ts, body: JSON.parse(r.body) }));
  }

  /** Append events, skipping ones already stored (by eventId). Returns the newly stored events with seq. */
  append(combatId: string, events: CombatEvent[]): CombatEvent[] {
    if (!this.exists(combatId)) throw new Error(`Unknown combat ${combatId}`);
    const stored: CombatEvent[] = [];
    const insert = this.db.prepare('INSERT OR IGNORE INTO events (combat_id, seq, event_id, ts, body) VALUES (?, ?, ?, ?, ?)');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      let seq = (this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM events WHERE combat_id = ?').get(combatId) as { s: number }).s;
      for (const ev of events) {
        const res = insert.run(combatId, seq + 1, ev.eventId, ev.ts, JSON.stringify(ev.body));
        if (res.changes > 0) {
          seq += 1;
          stored.push({ ...ev, seq });
        }
      }
      if (stored.length) {
        const renamed = [...stored].reverse().find((e) => e.body.type === 'combat/renamed' || e.body.type === 'combat/created');
        this.db.prepare('UPDATE combats SET updated_at = ? WHERE id = ?').run(Date.now(), combatId);
        if (renamed) this.db.prepare('UPDATE combats SET name = ? WHERE id = ?').run((renamed.body as { name: string }).name, combatId);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    if (stored.length) this.cache.delete(combatId);
    return stored;
  }

  state(combatId: string): Materialized {
    const cached = this.cache.get(combatId);
    if (cached) return cached.m;
    const events = this.events(combatId);
    const m = materialize(combatId, events);
    this.cache.set(combatId, { seq: events.at(-1)?.seq ?? 0, m });
    return m;
  }

  setArchived(combatId: string, archived: boolean): void {
    this.db.prepare('UPDATE combats SET archived = ? WHERE id = ?').run(archived ? 1 : 0, combatId);
  }

  deleteCombat(combatId: string): void {
    this.db.prepare('DELETE FROM combats WHERE id = ?').run(combatId);
    this.cache.delete(combatId);
  }
}
