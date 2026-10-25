import { afterEach, describe, expect, it } from 'vitest';
import configJson from '../../../packages/core/test/fixtures/ddb-config.slim.json' with { type: 'json' };
import { beholder2024 } from '../../../packages/core/test/fixtures/monsters.ts';
import { buildApp, type AppContext } from '../src/app.ts';
import { MemorySecretStore } from '../src/secrets.ts';

const encounter = {
  id: '3cd19a1a-66e5-4d89-8fcf-2c24fdf0f6c0',
  name: 'Dominica - Beholder',
  campaign: { id: 99, name: 'Test Campaign' },
  monsters: [{ id: 5194923, uniqueId: 'u1', name: 'Beholder', quantity: 1, currentHitPoints: 190, maximumHitPoints: 190, temporaryHitPoints: 0, initiative: null }],
  players: [{ id: '1001', name: 'Hero', level: 8, type: 'CHARACTER_TYPE_DDB', hidden: false, initiative: null }],
};

const heroSummary = {
  characterId: 1001,
  name: 'Hero',
  level: 8,
  armorClass: 18,
  initiativeBonus: 4,
  passivePerception: 14,
  hitPointInfo: { maximum: 60, current: 41, temp: 5 },
  conditions: [{ name: 'Poisoned', level: null }],
  deathSaveInfo: { failCount: 0, successCount: 0 },
};

interface Call { url: string; method: string }

function fakeDdb(opts: { validCookie?: string } = {}) {
  const calls: Call[] = [];
  const valid = opts.validCookie ?? 'good-cookie';
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    const cookie = String((init?.headers as Record<string, string>)?.Cookie ?? '');
    if (url.includes('auth-service')) return cookie === `CobaltSession=${valid}` ? json({ token: 'tok', ttl: 300 }) : json({}, 401);
    if (url.includes('encounter-service')) return json({ data: encounter });
    if (url.includes('monster-service')) return json({ data: [beholder2024], pagination: { total: 1 } });
    if (url.includes('character-service-scds')) {
      const ids = (JSON.parse(String(init?.body)) as { characterIds: number[] }).characterIds;
      return json({ foundCharacters: ids.filter((id) => id === 1001).map(() => heroSummary), queuedIds: ids.filter((id) => id !== 1001), notFoundIds: [] });
    }
    if (url.includes('character-service')) return json({ data: null }, 404);
    return json({}, 404);
  }) as typeof fetch;
  return { impl, calls };
}

let ctx: AppContext | undefined;
afterEach(async () => {
  await ctx?.app.close();
  ctx = undefined;
});

async function setup(cookie?: string) {
  const ddb = fakeDdb();
  ctx = await buildApp({ dataDir: '.', dbPath: ':memory:', secrets: new MemorySecretStore(cookie), fetchImpl: ddb.impl });
  ctx.kv.set('ddb:config', { at: Date.now(), config: configJson });
  return { ctx, ddb };
}

describe('event store', () => {
  it('assigns sequence numbers and dedups by eventId', async () => {
    const { ctx } = await setup();
    const id = ctx.store.createCombat({ type: 'combat/created', name: 'T', campaign: null, sourceEncounterId: null });
    const ev = { eventId: 'x', ts: 1, body: { type: 'combat/renamed', name: 'Renamed' } as const };
    expect(ctx.store.append(id, [ev])).toHaveLength(1);
    expect(ctx.store.append(id, [ev])).toHaveLength(0);
    expect(ctx.store.events(id).map((e) => e.seq)).toEqual([1, 2]);
    expect(ctx.store.state(id).state.name).toBe('Renamed');
    expect(ctx.store.listCombats()[0].name).toBe('Renamed');
  });
});

describe('API', () => {
  it('reports unconfigured DDB and rejects a bad cookie without storing it', async () => {
    const { ctx } = await setup();
    expect((await ctx.app.inject({ url: '/api/status' })).json().ddb).toBe('unconfigured');
    const bad = await ctx.app.inject({ method: 'PUT', url: '/api/settings/ddb', payload: { cobaltSession: 'nope' } });
    expect(bad.statusCode).toBe(401);
    expect((await ctx.app.inject({ url: '/api/status' })).json().ddb).toBe('unconfigured');
    const good = await ctx.app.inject({ method: 'PUT', url: '/api/settings/ddb', payload: { cobaltSession: 'CobaltSession=good-cookie; Path=/' } });
    expect(good.json().ddb).toBe('ok');
  });

  it('only lets this computer change the D&D Beyond login', async () => {
    const { ctx } = await setup();
    const lan = await ctx.app.inject({ method: 'PUT', url: '/api/settings/ddb', remoteAddress: '192.168.1.20', payload: { cobaltSession: 'good-cookie' } });
    expect(lan.statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'DELETE', url: '/api/settings/ddb', remoteAddress: '192.168.1.20' })).statusCode).toBe(403);
    expect((await ctx.app.inject({ url: '/api/status', remoteAddress: '192.168.1.20' })).json().ddb).toBe('unconfigured');
  });

  it('imports a DDB encounter into a new event-sourced combat', async () => {
    const { ctx, ddb } = await setup('good-cookie');
    const res = await ctx.app.inject({ method: 'POST', url: '/api/combats/import', payload: { encounterId: encounter.id } });
    expect(res.statusCode).toBe(200);
    const { state } = ctx.store.state(res.json().id);
    expect(state.name).toBe('Dominica - Beholder');
    expect(state.campaign).toEqual({ id: 99, name: 'Test Campaign' });
    const names = Object.values(state.combatants).map((c) => c.name).sort();
    expect(names).toEqual(['Beholder', 'Hero']);
    expect(state.statBlocks['5194923'].name).toBe('Beholder');
    expect(state.combatants.u1.resources.map((r) => r.name)).toEqual(['Legendary Resistance', 'Legendary Actions']);

    // Read-only guarantee (ADR 0003): non-GET requests go only to the token mint and the
    // read-only summary query.
    await ctx.poller.tick([1001]);
    const nonGet = ddb.calls.filter((c) => c.method !== 'GET');
    expect(nonGet.length).toBeGreaterThan(0);
    expect(nonGet.every((c) => c.method === 'POST' && (c.url.includes('auth-service') || c.url.includes('character-service-scds')))).toBe(true);
  });

  it('polls PC summaries for AC, initiative and HP in one request', async () => {
    const { ctx, ddb } = await setup('good-cookie');
    await ctx.poller.tick([1001, 2002]);
    expect(ddb.calls.filter((c) => c.url.includes('scds'))).toHaveLength(1);
    const snap = ctx.poller.get([1001, 2002]);
    expect(snap[1001]).toMatchObject({ hp: { current: 41, max: 60, temp: 5 }, conditions: [{ name: 'Poisoned' }], stats: { ac: 18, initBonus: 4 } });
    // 2002 wasn't in the summary and its sheet 404s, so there is nothing to show yet.
    expect(snap[2002]).toBeUndefined();
    expect(ctx.poller.errors.get(2002)).toMatch(/404/);
  });

  it('accepts events over HTTP and dedups retries', async () => {
    const { ctx } = await setup();
    const { id } = (await ctx.app.inject({ method: 'POST', url: '/api/combats', payload: { name: 'Ad hoc' } })).json();
    const payload = { events: [{ eventId: 'e1', ts: 1, body: { type: 'combat/renamed', name: 'Bridge fight' } }] };
    await ctx.app.inject({ method: 'POST', url: `/api/combats/${id}/events`, payload });
    const again = await ctx.app.inject({ method: 'POST', url: `/api/combats/${id}/events`, payload });
    expect(again.json().stored).toEqual([]);
    expect(ctx.store.state(id).state.name).toBe('Bridge fight');
  });

  it('serves saved encounters', async () => {
    const { ctx } = await setup();
    await ctx.app.inject({ method: 'PUT', url: '/api/encounters/abc', payload: { name: 'Ambush', monsters: [] } });
    const list = (await ctx.app.inject({ url: '/api/encounters' })).json();
    expect(list).toMatchObject([{ id: 'abc', name: 'Ambush' }]);
  });
});
