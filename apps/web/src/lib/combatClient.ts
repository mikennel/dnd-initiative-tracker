import { materialize, type CombatEvent, type CombatEventBody, type Materialized, type PcSnapshot } from '@dnd/core';
import { idbGet, idbSet } from './idb.ts';
import { uuid } from './ids.ts';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface CombatView extends Materialized {
  pcLive: Record<number, PcSnapshot>;
  connection: ConnectionStatus;
  pendingCount: number;
  loaded: boolean;
  notFound: boolean;
}

/** Shown before the client for a combat exists. */
export const EMPTY_VIEW: CombatView = {
  ...materialize('', []),
  pcLive: {},
  connection: 'connecting',
  pendingCount: 0,
  loaded: false,
  notFound: false,
};

/**
 * Client sync engine (docs/architecture.md, "Data flow for one DM action").
 * State = materialize(confirmed server events + local pending events). Pending events are
 * persisted to IndexedDB before sending, and confirmed events are cached too, so a reload
 * (or a dead server) never loses the DM's input. Events are idempotent by eventId.
 */
export class CombatClient {
  private confirmed: CombatEvent[] = [];
  private pending: CombatEvent[] = [];
  private pcLive: Record<number, PcSnapshot> = {};
  private connection: ConnectionStatus = 'connecting';
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private view: CombatView;
  private closed = false;
  private retry = 0;
  private loaded = false;
  private notFound = false;

  constructor(readonly combatId: string) {
    this.view = this.compute();
    void this.restore().then(() => this.connect());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getView = (): CombatView => this.view;

  dispatch(...bodies: CombatEventBody[]): void {
    const events = bodies.map((body) => ({ eventId: uuid(), ts: Date.now(), body }));
    this.pending.push(...events);
    void idbSet(this.key('pending'), this.pending);
    this.changed();
    this.flush();
  }

  close() {
    this.closed = true;
    this.ws?.close();
    this.listeners.clear();
  }

  private key(kind: 'pending' | 'events') {
    return `${kind}:${this.combatId}`;
  }

  private async restore() {
    const [events, pending] = await Promise.all([idbGet<CombatEvent[]>(this.key('events')), idbGet<CombatEvent[]>(this.key('pending'))]);
    if (events?.length && !this.confirmed.length) this.confirmed = events;
    if (pending?.length) this.pending = [...pending, ...this.pending.filter((p) => !pending.some((x) => x.eventId === p.eventId))];
    if (events?.length) this.loaded = true;
    this.changed();
  }

  private connect() {
    if (this.closed) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;
    this.setConnection('connecting');
    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify({ t: 'subscribe', combatId: this.combatId, role: 'dm' }));
    };
    ws.onmessage = (msg) => this.onMessage(JSON.parse(msg.data));
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setConnection('offline');
      if (!this.closed) setTimeout(() => this.connect(), Math.min(5000, 500 * 2 ** this.retry++));
    };
  }

  private onMessage(msg: any) {
    if (msg.combatId && msg.combatId !== this.combatId) return;
    switch (msg.t) {
      case 'snapshot':
        this.confirmed = msg.events;
        this.pcLive = msg.pcLive ?? {};
        this.loaded = true;
        this.notFound = false;
        this.prunePending();
        this.setConnection('online');
        this.flush();
        break;
      case 'events': {
        const last = this.confirmed.at(-1)?.seq ?? 0;
        const fresh = (msg.events as CombatEvent[]).filter((e) => (e.seq ?? 0) > last);
        if (fresh.length && fresh[0].seq !== last + 1) {
          // Missed something; ask for a full snapshot.
          this.ws?.send(JSON.stringify({ t: 'subscribe', combatId: this.combatId, role: 'dm' }));
          return;
        }
        this.confirmed = [...this.confirmed, ...fresh];
        this.prunePending();
        break;
      }
      case 'pcLive':
        this.pcLive = { ...this.pcLive, ...msg.pcLive };
        break;
      case 'error':
        if (msg.code === 'not-found') {
          this.notFound = true;
          this.loaded = true;
        }
        console.warn('[combat]', msg.message);
        break;
      default:
        return;
    }
    void idbSet(this.key('events'), this.confirmed);
    this.changed();
  }

  private prunePending() {
    const ids = new Set(this.confirmed.map((e) => e.eventId));
    const before = this.pending.length;
    this.pending = this.pending.filter((e) => !ids.has(e.eventId));
    if (this.pending.length !== before) void idbSet(this.key('pending'), this.pending);
  }

  private flush() {
    if (!this.pending.length) return;
    if (this.ws?.readyState === WebSocket.OPEN && this.connection === 'online') {
      this.ws.send(JSON.stringify({ t: 'events', combatId: this.combatId, events: this.pending }));
      return;
    }
    // WebSocket down: try plain HTTP. If that fails too, events stay pending until reconnect.
    void fetch(`/api/combats/${this.combatId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: this.pending }),
    }).catch(() => {});
  }

  private setConnection(c: ConnectionStatus) {
    if (this.connection === c) return;
    this.connection = c;
    this.changed();
  }

  private compute(): CombatView {
    return {
      ...materialize(this.combatId, [...this.confirmed, ...this.pending]),
      pcLive: this.pcLive,
      connection: this.connection,
      pendingCount: this.pending.length,
      loaded: this.loaded,
      notFound: this.notFound,
    };
  }

  private changed() {
    this.view = this.compute();
    for (const fn of this.listeners) fn();
  }
}
