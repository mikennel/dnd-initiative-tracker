import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api, type DdbStatus } from './api.ts';
import { CombatClient, EMPTY_VIEW } from './combatClient.ts';

/**
 * The client is created inside the effect (not useMemo) so StrictMode's mount → unmount →
 * mount cycle in dev gets a fresh, open client rather than a closed one.
 */
export function useCombat(combatId: string) {
  const [client, setClient] = useState<CombatClient | null>(null);
  useEffect(() => {
    const c = new CombatClient(combatId);
    setClient(c);
    return () => c.close();
  }, [combatId]);
  const subscribe = useCallback((fn: () => void) => (client ? client.subscribe(fn) : () => {}), [client]);
  const view = useSyncExternalStore(subscribe, () => (client ? client.getView() : EMPTY_VIEW));
  const dispatch = useCallback<CombatClient['dispatch']>((...bodies) => client?.dispatch(...bodies), [client]);
  return { view, dispatch };
}

export function useStatus(pollMs = 15000) {
  const [status, setStatus] = useState<{ ddb: DdbStatus; ddbError: string | null; lanUrls: string[]; tableCombatId: string | null } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .status()
        .then((s) => alive && (setStatus(s), setError(false)))
        .catch(() => alive && setError(true));
    void load();
    const t = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);
  return { status, serverDown: error };
}

/** Re-render every `ms` (for "synced 4s ago" labels). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
