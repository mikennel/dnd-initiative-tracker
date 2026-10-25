import { playerView, type CombatEvent, type PcSnapshot } from '@dnd/core';
import type { WebSocket } from 'ws';
import type { Kv } from './store/db.ts';
import type { EventStore } from './store/eventStore.ts';

/**
 * WebSocket protocol (docs/architecture.md):
 *   client → server  { t:'subscribe', combatId, role:'dm'|'table' }   combatId 'current' follows the DM
 *                    { t:'events', combatId, events: CombatEvent[] }  (dm only)
 *   server → dm      { t:'snapshot', combatId, events, pcLive }  { t:'events', combatId, events }
 *                    { t:'ack', eventIds }  { t:'pcLive', pcLive }  { t:'error', message }
 *   server → table   { t:'table', combatId, view }   (playerView projection only, ADR 0005)
 */
export type Role = 'dm' | 'table';

interface Client {
  socket: WebSocket;
  role: Role;
  combatId: string | null;
  follow: boolean;
}

const TABLE_KEY = 'table:combatId';

export class Hub {
  private clients = new Set<Client>();

  constructor(
    private store: EventStore,
    private kv: Kv,
    private pcLive: (ids: Iterable<number>) => Record<number, PcSnapshot>,
    private onWatchChange: () => void = () => {},
  ) {}

  get tableCombatId(): string | null {
    const id = this.kv.get<string>(TABLE_KEY) ?? null;
    return id && this.store.exists(id) ? id : null;
  }

  setTableCombat(combatId: string | null) {
    if (combatId) this.kv.set(TABLE_KEY, combatId);
    else this.kv.delete(TABLE_KEY);
    for (const c of this.clients) {
      if (c.role === 'table' && c.follow) {
        c.combatId = combatId;
        this.sendTable(c);
      }
    }
  }

  attach(socket: WebSocket) {
    const client: Client = { socket, role: 'dm', combatId: null, follow: false };
    this.clients.add(client);
    socket.on('close', () => {
      this.clients.delete(client);
      this.onWatchChange();
    });
    socket.on('message', (data) => {
      let msg: any;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      try {
        this.handle(client, msg);
      } catch (err) {
        send(socket, { t: 'error', message: String((err as Error).message ?? err) });
      }
    });
  }

  private handle(client: Client, msg: any) {
    if (msg.t === 'subscribe') {
      client.role = msg.role === 'table' ? 'table' : 'dm';
      client.follow = msg.combatId === 'current';
      client.combatId = client.follow ? this.tableCombatId : String(msg.combatId);
      if (client.combatId && !this.store.exists(client.combatId)) {
        send(client.socket, { t: 'error', message: 'Combat not found', code: 'not-found' });
        client.combatId = null;
        return;
      }
      if (client.role === 'dm') {
        // The table follows whichever combat the DM opened last.
        if (client.combatId && this.tableCombatId !== client.combatId) this.setTableCombat(client.combatId);
        this.sendSnapshot(client);
      } else {
        this.sendTable(client);
      }
      this.onWatchChange();
      return;
    }
    if (msg.t === 'events' && client.role === 'dm') {
      const combatId = String(msg.combatId);
      const events = (msg.events as CombatEvent[]).map((e) => ({ eventId: String(e.eventId), ts: Number(e.ts) || Date.now(), body: e.body }));
      const stored = this.store.append(combatId, events);
      send(client.socket, { t: 'ack', combatId, eventIds: events.map((e) => e.eventId) });
      if (stored.length) this.publish(combatId, stored);
    }
  }

  /** Broadcast newly stored events to DMs and a fresh projection to tables. */
  publish(combatId: string, stored: CombatEvent[]) {
    for (const c of this.clients) {
      if (c.combatId !== combatId) continue;
      if (c.role === 'dm') send(c.socket, { t: 'events', combatId, events: stored });
      else this.sendTable(c);
    }
    // New PCs may have been added.
    if (stored.some((e) => e.body.type === 'combatant/added' || e.body.type === 'batch')) this.onWatchChange();
  }

  /** Character ids of PCs in combats that at least one client is viewing. */
  watchedCharacterIds(): Set<number> {
    const ids = new Set<number>();
    const combats = new Set([...this.clients].map((c) => c.combatId).filter((x): x is string => !!x));
    for (const id of combats) for (const cid of this.characterIds(id)) ids.add(cid);
    return ids;
  }

  pcUpdated(snaps: PcSnapshot[], changed: PcSnapshot[]) {
    const changedIds = new Set(changed.map((s) => s.characterId));
    for (const c of this.clients) {
      if (!c.combatId) continue;
      const mine = this.characterIds(c.combatId);
      if (c.role === 'dm') {
        const pcLive = Object.fromEntries(snaps.filter((s) => mine.has(s.characterId)).map((s) => [s.characterId, s]));
        if (Object.keys(pcLive).length) send(c.socket, { t: 'pcLive', combatId: c.combatId, pcLive });
      } else if ([...mine].some((id) => changedIds.has(id))) {
        this.sendTable(c);
      }
    }
  }

  private characterIds(combatId: string): Set<number> {
    const { state } = this.store.state(combatId);
    return new Set(Object.values(state.combatants).map((c) => c.source?.ddbCharacterId).filter((x): x is number => x !== undefined));
  }

  private sendSnapshot(c: Client) {
    if (!c.combatId) return;
    send(c.socket, { t: 'snapshot', combatId: c.combatId, events: this.store.events(c.combatId), pcLive: this.pcLive(this.characterIds(c.combatId)) });
  }

  private sendTable(c: Client) {
    if (!c.combatId) {
      send(c.socket, { t: 'table', combatId: null, view: null });
      return;
    }
    const { state } = this.store.state(c.combatId);
    send(c.socket, { t: 'table', combatId: c.combatId, view: playerView(state, this.pcLive(this.characterIds(c.combatId))) });
  }
}

function send(socket: WebSocket, msg: unknown) {
  if (socket.readyState === 1) socket.send(JSON.stringify(msg));
}
