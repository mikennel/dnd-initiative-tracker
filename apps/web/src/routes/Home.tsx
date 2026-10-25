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
  const [ddb, setDdb] = useState<{ total: number; encounters: DdbEncounter[] } | null>(null);
  const [ddbError, setDdbError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [url, setUrl] = useState('');
  const [hpMode, setHpMode] = useState<'ddb' | 'average' | 'roll'>('ddb');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCombats = () => api.combats().then(setCombats).catch(() => setCombats([]));
  useEffect(() => void loadCombats(), []);

  useEffect(() => {
    if (status?.ddb !== 'ok') return;
    setDdbError(null);
    api.ddbEncounters(page * PAGE, PAGE).then(setDdb).catch((e) => setDdbError(e.message));
  }, [status?.ddb, page]);

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
              <ul className="list">
                {ddb?.encounters.map((e) => (
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
              {ddb && ddb.total > PAGE && (
                <div className="row">
                  <button className="small" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    ← Newer
                  </button>
                  <span className="muted">
                    Page {page + 1} of {Math.ceil(ddb.total / PAGE)}
                  </span>
                  <button className="small" disabled={(page + 1) * PAGE >= ddb.total} onClick={() => setPage(page + 1)}>
                    Older →
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
