import {
  mapCharacter,
  mapCharacterSummary,
  mapMonster,
  slimConfig,
  type DdbCharacter,
  type DdbCharacterSummaryResponse,
  type DdbConfig,
  type DdbEncounter,
  type DdbMonster,
  type MonsterStatBlock,
  type PcSnapshot,
} from '@dnd/core';
import type { Db, Kv } from '../store/db.ts';

/**
 * The ONLY module that talks to D&D Beyond (docs/ddb-api.md). It is read-only by design
 * (ADR 0003): there is no method that writes to DDB. Requests are GETs, plus POSTs to the
 * token endpoint and to the allowlisted read-only query endpoints (`query()`).
 */

const AUTH_URL = 'https://auth-service.dndbeyond.com/v1/cobalt-token';
const CONFIG_URL = 'https://www.dndbeyond.com/api/config/json';
const ENCOUNTERS = 'https://encounter-service.dndbeyond.com/v1/encounters';
const MONSTERS = 'https://monster-service.dndbeyond.com/v1/Monster';
const CHARACTER = 'https://character-service.dndbeyond.com/character/v5/character';
const CHARACTER_SUMMARIES = 'https://character-service-scds.dndbeyond.com/v2/characters';
/** POST endpoints that only read: the body is a query, nothing is changed (ADR 0003). */
const READ_ONLY_POSTS = new Set([CHARACTER_SUMMARIES]);
const CAMPAIGNS = 'https://www.dndbeyond.com/api/campaign';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) dnd-initiative-tracker/0.1';
const CONFIG_TTL_MS = 24 * 3600_000;
const MONSTER_TTL_MS = 7 * 24 * 3600_000;

export type DdbStatus = 'unconfigured' | 'ok' | 'auth-failed' | 'unreachable';

export class DdbError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface SecretStore {
  getCobaltSession(): string | undefined;
  setCobaltSession(value: string | undefined): void;
}

export class DdbClient {
  status: DdbStatus;
  lastError: string | null = null;
  private token: { value: string; expiresAt: number } | null = null;
  private tokenPromise: Promise<string> | null = null;
  private config: DdbConfig | null = null;

  constructor(
    private secrets: SecretStore,
    private kv: Kv,
    private db: Db,
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.status = secrets.getCobaltSession() ? 'ok' : 'unconfigured';
  }

  /** Store a new session cookie and verify it by minting a token. */
  async setSession(raw: string): Promise<void> {
    const value = raw.trim().replace(/^CobaltSession=/i, '').replace(/;.*$/, '');
    if (!value) throw new DdbError('Empty cookie value', 400);
    const previous = this.secrets.getCobaltSession();
    this.secrets.setCobaltSession(value);
    this.token = null;
    try {
      await this.getToken();
    } catch (err) {
      this.secrets.setCobaltSession(previous);
      this.token = null;
      this.status = previous ? this.status : 'unconfigured';
      throw err;
    }
  }

  clearSession(): void {
    this.secrets.setCobaltSession(undefined);
    this.token = null;
    this.status = 'unconfigured';
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    this.tokenPromise ??= (async () => {
      const cookie = this.secrets.getCobaltSession();
      if (!cookie) {
        this.status = 'unconfigured';
        throw new DdbError('D&D Beyond is not connected. Paste your CobaltSession cookie in Settings.', 401);
      }
      let res: Response;
      try {
        res = await this.fetchImpl(AUTH_URL, { method: 'POST', headers: { Cookie: `CobaltSession=${cookie}`, 'User-Agent': USER_AGENT } });
      } catch (err) {
        this.status = 'unreachable';
        this.lastError = String(err);
        throw new DdbError('Could not reach D&D Beyond', 503);
      }
      const body = (await res.json().catch(() => null)) as { token?: string; ttl?: number } | null;
      if (!res.ok || !body?.token) {
        this.status = 'auth-failed';
        this.lastError = `Token request failed (${res.status})`;
        throw new DdbError('D&D Beyond rejected the session cookie. It may have expired; paste a fresh one in Settings.', 401);
      }
      this.status = 'ok';
      this.lastError = null;
      const ttl = body.ttl ?? 300;
      this.token = { value: body.token, expiresAt: Date.now() + Math.max(30, ttl - 30) * 1000 };
      return body.token;
    })().finally(() => {
      this.tokenPromise = null;
    });
    return this.tokenPromise;
  }

  /** Authenticated GET. Retries once with a fresh token on 401. */
  get<T>(url: string): Promise<T> {
    return this.request<T>(url);
  }

  /**
   * Authenticated read-only POST, for DDB query endpoints that take their parameters in the
   * body. Only URLs in READ_ONLY_POSTS are allowed (ADR 0003).
   */
  query<T>(url: string, body: unknown): Promise<T> {
    if (!READ_ONLY_POSTS.has(url)) throw new DdbError(`Refusing to POST to ${url}: not a known read-only query`, 500);
    return this.request<T>(url, JSON.stringify(body));
  }

  private async request<T>(url: string, body?: string, retry = true): Promise<T> {
    const token = await this.getToken();
    const cookie = this.secrets.getCobaltSession();
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: `CobaltSession=${cookie}`,
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body,
      });
    } catch (err) {
      this.status = 'unreachable';
      this.lastError = String(err);
      throw new DdbError('Could not reach D&D Beyond', 503);
    }
    if (res.status === 401 && retry) {
      this.token = null;
      return this.request<T>(url, body, false);
    }
    if (!res.ok) throw new DdbError(`D&D Beyond returned ${res.status} for ${new URL(url).pathname}`, res.status === 401 ? 401 : 502);
    this.status = 'ok';
    return (await res.json()) as T;
  }

  // ---------- Config (public) ----------

  async getConfig(): Promise<DdbConfig> {
    if (this.config) return this.config;
    const cached = this.kv.get<{ at: number; config: DdbConfig }>('ddb:config');
    if (cached && Date.now() - cached.at < CONFIG_TTL_MS) return (this.config = cached.config);
    try {
      const res = await this.fetchImpl(CONFIG_URL, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(String(res.status));
      const config = slimConfig(await res.json());
      this.kv.set('ddb:config', { at: Date.now(), config });
      return (this.config = config);
    } catch (err) {
      if (cached) return (this.config = cached.config);
      throw new DdbError(`Could not load D&D Beyond config: ${err}`, 503);
    }
  }

  // ---------- Campaigns ----------

  async listCampaigns(): Promise<{ id: number; name: string; dmUsername: string }[]> {
    const res = await this.get<{ data: { id: number; name: string; dmUsername: string }[] }>(`${CAMPAIGNS}/active-campaigns`);
    return res.data.map(({ id, name, dmUsername }) => ({ id, name, dmUsername }));
  }

  async campaignCharacters(campaignId: number): Promise<{ id: number; name: string; userName: string; avatarUrl: string | null }[]> {
    const res = await this.get<{ data: { id: number; name: string; userName: string; avatarUrl: string | null; characterStatus: number }[] }>(
      `${CAMPAIGNS}/stt/active-short-characters/${campaignId}`,
    );
    return res.data.filter((c) => c.characterStatus === 1).map(({ id, name, userName, avatarUrl }) => ({ id, name, userName, avatarUrl }));
  }

  // ---------- Encounters ----------

  async listEncounters(skip = 0, take = 20): Promise<{ total: number; encounters: DdbEncounter[] }> {
    const res = await this.get<{ pagination: { total: number }; data: DdbEncounter[] }>(`${ENCOUNTERS}?skip=${skip}&take=${take}`);
    return { total: res.pagination?.total ?? res.data.length, encounters: res.data };
  }

  async getEncounter(id: string): Promise<DdbEncounter> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new DdbError('Invalid encounter id', 400);
    return (await this.get<{ data: DdbEncounter }>(`${ENCOUNTERS}/${id}`)).data;
  }

  // ---------- Monsters (cached in SQLite so imported encounters work offline) ----------

  async getMonsters(ids: number[]): Promise<Record<number, MonsterStatBlock>> {
    const cfg = await this.getConfig();
    const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
    const raw: Record<number, DdbMonster> = {};
    const stale: number[] = [];
    const sel = this.db.prepare('SELECT raw, fetched_at FROM monster_cache WHERE id = ?');
    for (const id of unique) {
      const row = sel.get(id) as { raw: string; fetched_at: number } | undefined;
      if (row) raw[id] = JSON.parse(row.raw);
      if (!row || Date.now() - row.fetched_at > MONSTER_TTL_MS) stale.push(id);
    }
    if (stale.length) {
      try {
        for (let i = 0; i < stale.length; i += 50) {
          const chunk = stale.slice(i, i + 50);
          // DDB wants the parameter repeated (ids=1&ids=2); a comma list is a 400.
          const query = new URLSearchParams(chunk.map((id): [string, string] => ['ids', String(id)]));
          const res = await this.get<{ data: DdbMonster[] }>(`${MONSTERS}?${query}`);
          for (const m of res.data) {
            raw[m.id] = m;
            this.cacheMonster(m);
          }
        }
      } catch (err) {
        if (unique.some((id) => !raw[id])) throw err; // Fall back to cache only if it covers everything.
      }
    }
    return Object.fromEntries(Object.entries(raw).map(([id, m]) => [id, mapMonster(m, cfg)]));
  }

  async searchMonsters(query: string, opts: { homebrew?: boolean; skip?: number; take?: number } = {}): Promise<{ total: number; monsters: MonsterStatBlock[] }> {
    const cfg = await this.getConfig();
    const params = new URLSearchParams({ skip: String(opts.skip ?? 0), take: String(opts.take ?? 20) });
    if (query) params.set('search', query);
    if (opts.homebrew) {
      params.set('showHomebrew', 't');
      params.set('homebrewOnly', 'true');
    }
    const res = await this.get<{ pagination: { total: number }; data: DdbMonster[] }>(`${MONSTERS}?${params}`);
    for (const m of res.data) this.cacheMonster(m);
    return { total: res.pagination?.total ?? res.data.length, monsters: res.data.map((m) => mapMonster(m, cfg)) };
  }

  /** Offline search over monsters we've seen before. */
  searchCachedMonsters(query: string, cfg: DdbConfig, limit = 20): MonsterStatBlock[] {
    const rows = this.db.prepare('SELECT raw FROM monster_cache WHERE name LIKE ? ORDER BY name LIMIT ?').all(`%${query}%`, limit) as { raw: string }[];
    return rows.map((r) => mapMonster(JSON.parse(r.raw), cfg));
  }

  private cacheMonster(m: DdbMonster) {
    this.db
      .prepare('INSERT INTO monster_cache (id, name, raw, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, raw = excluded.raw, fetched_at = excluded.fetched_at')
      .run(m.id, m.name, JSON.stringify(m), Date.now());
  }

  // ---------- Characters ----------

  /**
   * Precomputed summaries (AC, initiative, HP, conditions...) for many characters in one
   * request. Ids DDB hasn't computed yet come back in `queued` and are missing from `found`.
   */
  async getCharacterSummaries(ids: number[]): Promise<{ found: PcSnapshot[]; missing: number[] }> {
    const found: PcSnapshot[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const res = await this.query<DdbCharacterSummaryResponse>(CHARACTER_SUMMARIES, { characterIds: ids.slice(i, i + 50) });
      const now = Date.now();
      for (const s of res.foundCharacters ?? []) found.push(mapCharacterSummary(s, now));
    }
    const got = new Set(found.map((s) => s.characterId));
    return { found, missing: ids.filter((id) => !got.has(id)) };
  }

  async getCharacter(id: number): Promise<PcSnapshot> {
    const cfg = await this.getConfig();
    const res = await this.get<{ data: DdbCharacter }>(`${CHARACTER}/${id}`);
    return mapCharacter(res.data, cfg);
  }
}
