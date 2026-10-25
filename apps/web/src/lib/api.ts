import type { DdbEncounter, MonsterStatBlock, PcSnapshot } from '@dnd/core';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly ddbStatus?: string) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.ddbStatus);
  return data as T;
}

export type DdbStatus = 'unconfigured' | 'ok' | 'auth-failed' | 'unreachable';

export interface CombatSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  eventCount: number;
}

export interface SavedEncounter {
  id: string;
  name: string;
  campaign: { id: number; name: string } | null;
  monsters: { ddbId: number; name: string; count: number; xp: number; cr: string }[];
  partyLevels: number[];
  notes?: string;
  updatedAt?: number;
}

export const api = {
  status: () => req<{ ddb: DdbStatus; ddbError: string | null; tableCombatId: string | null; lanUrls: string[] }>('GET', '/api/status'),
  setCookie: (cobaltSession: string) => req<{ ddb: DdbStatus }>('PUT', '/api/settings/ddb', { cobaltSession }),
  clearCookie: () => req<{ ddb: DdbStatus }>('DELETE', '/api/settings/ddb'),

  campaigns: () => req<{ id: number; name: string; dmUsername: string }[]>('GET', '/api/ddb/campaigns'),
  campaignCharacters: (id: number) => req<{ id: number; name: string; userName: string; avatarUrl: string | null }[]>('GET', `/api/ddb/campaigns/${id}/characters`),
  ddbEncounters: (skip = 0, take = 20) => req<{ total: number; encounters: DdbEncounter[] }>('GET', `/api/ddb/encounters?skip=${skip}&take=${take}`),
  monsters: (ids: number[]) => req<Record<number, MonsterStatBlock>>('GET', `/api/ddb/monsters?ids=${ids.join(',')}`),
  searchMonsters: (q: string, homebrew = false) =>
    req<{ total: number; monsters: MonsterStatBlock[]; offline?: boolean }>('GET', `/api/ddb/monsters/search?q=${encodeURIComponent(q)}&homebrew=${homebrew ? 1 : 0}&take=25`),
  character: (id: number) => req<PcSnapshot>('GET', `/api/ddb/characters/${id}`),

  combats: () => req<CombatSummary[]>('GET', '/api/combats'),
  createCombat: (name: string, campaign: { id: number; name: string } | null = null, events?: unknown[]) =>
    req<{ id: string }>('POST', '/api/combats', { name, campaign, events }),
  importEncounter: (encounterId: string, hp: 'ddb' | 'average' | 'roll' = 'ddb') => req<{ id: string }>('POST', '/api/combats/import', { encounterId, hp }),
  archiveCombat: (id: string, archived = true) => req('PATCH', `/api/combats/${id}`, { archived }),
  deleteCombat: (id: string) => req('DELETE', `/api/combats/${id}`),
  setTable: (combatId: string | null) => req('PUT', '/api/table', { combatId }),

  encounters: () => req<SavedEncounter[]>('GET', '/api/encounters'),
  saveEncounter: (e: SavedEncounter) => req<SavedEncounter>('PUT', `/api/encounters/${e.id}`, e),
  deleteEncounter: (id: string) => req('DELETE', `/api/encounters/${id}`),
};

/** Accepts a full DDB encounter/combat-tracker URL or a bare id. */
export function parseEncounterId(input: string): string | null {
  const m = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(input);
  return m ? m[1].toLowerCase() : null;
}
