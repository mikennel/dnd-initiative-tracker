import type { DdbEncounter } from '@dnd/core';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DdbStatusBanner } from '../components/DdbStatusBanner.tsx';
import { api, parseEncounterId, type CombatSummary } from '../lib/api.ts';
import { useStatus } from '../lib/hooks.ts';

const PAGE = 15;

export function Home() {
  const nav = useNavigate();
  const { status, serverDown } = useStatus();
  const [combats, setCombats] = useState<CombatSummary[] | null>(null);
  const [ddb, setDdb] = useState<DdbEncounter[] | null>(null);
  const [query, setQuery] = useState('');
  const [ddbError, setDdbError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [url, setUrl] = useState('');
  const [hpMode, setHpMode] = useState<'ddb' | 'average' | 'roll'>('ddb');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCombats = () => api.combats().then(setCombats).catch(() => setCombats([]));
  useEffect(() => void loadCombats(), []);

  // Load every encounter once (a DM has ~100) so search and paging are instant and local.
  useEffect(() => {
    if (status?.ddb !== 'ok') return;
    setDdbError(null);
    let alive = true;
    (async () => {
      const all: DdbEncounter[] = [];
      for (let skip = 0; ; skip += 100) {
        const res = await api.ddbEncounters(skip, 100);
        all.push(...res.encounters);
        if (res.encounters.length === 0 || all.length >= res.total) break;
      }
      if (alive) setDdb(all.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })));
    })().catch((e) => alive && setDdbError(e.message));
    return () => {
      alive = false;
    };
  }, [status?.ddb]);

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (ddb ?? []).filter((e) => {
    const text = [e.name, e.campaign?.name ?? '', ...e.monsters.map((m) => m.name)].join(' ').toLowerCase();
    return terms.every((t) => text.includes(t));
  });
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE));
  const shown = matches.slice(page * PAGE, (page + 1) * PAGE);

  const importEnc = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = await api.importEncounter(id, hpMode);
      nav(`/dm/${res.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const newCombat = async () => {
    const res = await api.createCombat('New combat');
    nav(`/dm/${res.id}`);
  };

  const pastedId = parseEncounterId(url);

  return (
    <main className="page stack">
      <DdbStatusBanner status={status?.ddb} serverDown={serverDown} />
      {error && <div className="banner bad">{error}</div>}

      <div className="grid2">
        <section className="card stack">
          <div className="row">
            <h2 className="grow" style={{ margin: 0 }}>Your combats</h2>
            <button onClick={newCombat}>+ Empty combat</button>
          </div>
          {combats === null && <p className="muted">Loading…</p>}
          {combats?.length === 0 && <p className="muted">No combats yet. Import one from D&D Beyond or start an empty one.</p>}
          <ul className="list">
            {combats?.map((c) => (
              <li key={c.id}>
                <div className="grow">
                  <Link to={`/dm/${c.id}`}>
                    <strong>{c.name}</strong>
                  </Link>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {new Date(c.updatedAt).toLocaleString()} · {c.eventCount} actions
                  </div>
                </div>
                <button className="small ghost" title="Archive" onClick={() => api.archiveCombat(c.id).then(loadCombats)}>
                  Archive
                </button>
                <button
                  className="small ghost danger"
                  title="Delete permanently"
                  onClick={() => {
                    if (window.confirm(`Delete "${c.name}" and its history?`)) void api.deleteCombat(c.id).then(loadCombats);
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>Import from D&D Beyond</h2>
          <div className="row">
            <input className="grow" placeholder="Paste an encounter or combat-tracker URL" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="primary" disabled={!pastedId || !!busy} onClick={() => pastedId && importEnc(pastedId)}>
              Import
            </button>
          </div>
          <label className="row muted" style={{ fontSize: '0.9rem' }}>
            Monster HP:
            <select value={hpMode} onChange={(e) => setHpMode(e.target.value as typeof hpMode)}>
              <option value="ddb">As set on D&D Beyond</option>
              <option value="average">Average</option>
              <option value="roll">Roll hit dice</option>
            </select>
          </label>
          {status?.ddb === 'ok' && (
            <>
              {ddbError && <div className="banner bad">{ddbError}</div>}
              {!ddb && !ddbError && <p className="muted">Loading your encounters…</p>}
              {ddb && (
                <input
                  type="search"
                  placeholder={`Search ${ddb.length} encounters by name, campaign or monster…`}
                  aria-label="Search D&D Beyond encounters"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                />
              )}
              {ddb && matches.length === 0 && <p className="muted">No encounters match “{query}”.</p>}
              <ul className="list">
                {shown.map((e) => (
                  <li key={e.id}>
                    <div className="grow">
                      <strong>{e.name}</strong>
                      <div className="muted" style={{ fontSize: '0.85rem' }}>
                        {e.campaign?.name ?? 'No campaign'} · {e.monsters.length} monsters · {e.players.length} PCs
                      </div>
                    </div>
                    <button className="small" disabled={!!busy} onClick={() => importEnc(e.id)}>
                      {busy === e.id ? 'Importing…' : 'Run'}
                    </button>
                  </li>
                ))}
              </ul>
              {matches.length > PAGE && (
                <div className="row">
                  <button className="small" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    ← Previous
                  </button>
                  <span className="muted">
                    Page {page + 1} of {pageCount}
                  </span>
                  <button className="small" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
