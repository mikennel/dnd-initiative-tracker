import { randomUUID } from 'node:crypto';
import { encounterToEvents, type CombatEvent, type CombatEventBody } from '@dnd/core';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppContext } from './app.ts';
import { DdbError } from './ddb/client.ts';

export function registerRoutes(app: FastifyInstance, ctx: AppContext) {
  const { ddb, store, hub, poller, db } = ctx;

  app.setErrorHandler((err: Error, _req, reply: FastifyReply) => {
    const status = err instanceof DdbError ? err.status : (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    reply.status(status).send({ error: err.message, ddbStatus: ddb.status });
  });

  // ---------- Status & settings ----------

  app.get('/api/status', async () => ({
    ddb: ddb.status,
    ddbError: ddb.lastError,
    tableCombatId: hub.tableCombatId,
    lanUrls: ctx.lanUrls,
  }));

  app.put<{ Body: { cobaltSession: string } }>('/api/settings/ddb', async (req) => {
    await ddb.setSession(String(req.body?.cobaltSession ?? ''));
    void poller.tick();
    return { ddb: ddb.status };
  });

  app.delete('/api/settings/ddb', async () => {
    ddb.clearSession();
    return { ddb: ddb.status };
  });

  // ---------- DDB proxy (read-only) ----------

  app.get('/api/ddb/config', async () => ddb.getConfig());
  app.get('/api/ddb/campaigns', async () => ddb.listCampaigns());
  app.get<{ Params: { id: string } }>('/api/ddb/campaigns/:id/characters', async (req) => ddb.campaignCharacters(Number(req.params.id)));
  app.get<{ Querystring: { skip?: string; take?: string } }>('/api/ddb/encounters', async (req) =>
    ddb.listEncounters(Number(req.query.skip ?? 0), Math.min(100, Number(req.query.take ?? 20))),
  );
  app.get<{ Params: { id: string } }>('/api/ddb/encounters/:id', async (req) => ddb.getEncounter(req.params.id));
  app.get<{ Querystring: { ids: string } }>('/api/ddb/monsters', async (req) => ddb.getMonsters(String(req.query.ids ?? '').split(',').map(Number)));
  app.get<{ Querystring: { q?: string; homebrew?: string; skip?: string; take?: string } }>('/api/ddb/monsters/search', async (req) => {
    const q = String(req.query.q ?? '');
    try {
      return await ddb.searchMonsters(q, { homebrew: req.query.homebrew === '1', skip: Number(req.query.skip ?? 0), take: Number(req.query.take ?? 20) });
    } catch (err) {
      // Offline: search the local monster cache instead.
      const monsters = ddb.searchCachedMonsters(q, await ddb.getConfig());
      if (monsters.length) return { total: monsters.length, monsters, offline: true };
      throw err;
    }
  });
  app.get<{ Params: { id: string } }>('/api/ddb/characters/:id', async (req) => ddb.getCharacter(Number(req.params.id)));

  // ---------- Combats (event-sourced, ADR 0002) ----------

  app.get<{ Querystring: { archived?: string } }>('/api/combats', async (req) => store.listCombats(req.query.archived === '1'));

  app.post<{ Body: { name?: string; campaign?: { id: number; name: string } | null; events?: CombatEventBody[] } }>('/api/combats', async (req) => {
    const name = req.body?.name?.trim() || 'New combat';
    const extra = req.body?.events?.length ? [{ type: 'batch', label: 'Add combatants', events: req.body.events } as CombatEventBody] : [];
    const id = store.createCombat({ type: 'combat/created', name, campaign: req.body?.campaign ?? null, sourceEncounterId: null }, extra);
    return { id };
  });

  app.post<{ Body: { encounterId: string; hp?: 'average' | 'roll' | 'ddb'; keepInitiative?: boolean } }>('/api/combats/import', async (req) => {
    const enc = await ddb.getEncounter(String(req.body?.encounterId ?? ''));
    const statBlocks = await ddb.getMonsters(enc.monsters.map((m) => m.id));
    const events = encounterToEvents(enc, statBlocks, { hp: req.body?.hp ?? 'ddb', keepInitiative: req.body?.keepInitiative });
    const id = store.createCombat(
      { type: 'combat/created', name: enc.name, campaign: enc.campaign ?? null, sourceEncounterId: enc.id },
      [{ type: 'batch', label: `Import ${enc.name}`, events }],
    );
    const pcIds = enc.players.map((p) => Number(p.id)).filter(Number.isFinite);
    void poller.tick(pcIds);
    return { id };
  });

  app.get<{ Params: { id: string } }>('/api/combats/:id/events', async (req, reply) => {
    if (!store.exists(req.params.id)) return reply.status(404).send({ error: 'Combat not found' });
    return store.events(req.params.id);
  });

  /** HTTP fallback for clients whose WebSocket is down. Same semantics as the WS 'events' message. */
  app.post<{ Params: { id: string }; Body: { events: CombatEvent[] } }>('/api/combats/:id/events', async (req, reply) => {
    if (!store.exists(req.params.id)) return reply.status(404).send({ error: 'Combat not found' });
    const events = (req.body?.events ?? []).map((e) => ({ eventId: String(e.eventId ?? randomUUID()), ts: Number(e.ts) || Date.now(), body: e.body }));
    const stored = store.append(req.params.id, events);
    if (stored.length) hub.publish(req.params.id, stored);
    return { stored: stored.map((e) => ({ eventId: e.eventId, seq: e.seq })) };
  });

  app.patch<{ Params: { id: string }; Body: { archived: boolean } }>('/api/combats/:id', async (req) => {
    store.setArchived(req.params.id, !!req.body?.archived);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/combats/:id', async (req) => {
    store.deleteCombat(req.params.id);
    if (hub.tableCombatId === null) hub.setTableCombat(null);
    return { ok: true };
  });

  app.put<{ Body: { combatId: string | null } }>('/api/table', async (req) => {
    hub.setTableCombat(req.body?.combatId ?? null);
    return { combatId: hub.tableCombatId };
  });

  // ---------- Locally saved encounters (builder) ----------

  app.get('/api/encounters', async () => {
    const rows = db.prepare('SELECT id, name, doc, updated_at FROM encounters ORDER BY updated_at DESC').all() as { id: string; name: string; doc: string; updated_at: number }[];
    return rows.map((r) => ({ ...JSON.parse(r.doc), id: r.id, name: r.name, updatedAt: r.updated_at }));
  });

  app.put<{ Params: { id: string }; Body: { name: string } & Record<string, unknown> }>('/api/encounters/:id', async (req) => {
    const doc = { ...req.body, id: req.params.id };
    db.prepare('INSERT INTO encounters (id, name, doc, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, doc = excluded.doc, updated_at = excluded.updated_at').run(
      req.params.id,
      String(req.body?.name ?? 'Untitled'),
      JSON.stringify(doc),
      Date.now(),
    );
    return doc;
  });

  app.delete<{ Params: { id: string } }>('/api/encounters/:id', async (req) => {
    db.prepare('DELETE FROM encounters WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
