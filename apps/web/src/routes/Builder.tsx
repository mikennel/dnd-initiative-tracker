import { difficulty2014, difficulty2024, letterSuffix, monsterToCombatant, pcCombatant, signed, type CombatEventBody, type MonsterStatBlock } from '@dnd/core';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DdbStatusBanner } from '../components/DdbStatusBanner.tsx';
import { api, type SavedEncounter } from '../lib/api.ts';
import { useStatus } from '../lib/hooks.ts';
import { uuid } from '../lib/ids.ts';

interface PartyMember {
  id: number | null;
  name: string;
  level: number;
  avatarUrl?: string | null;
  include: boolean;
}

export function Builder() {
  const { encounterId } = useParams();
  const nav = useNavigate();
  const { status } = useStatus();
  const [saved, setSaved] = useState<SavedEncounter[]>([]);
  const [enc, setEnc] = useState<SavedEncounter>(() => blank());
  const [party, setParty] = useState<PartyMember[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: number; name: string }[]>([]);
  const [rules, setRules] = useState<'2014' | '2024'>('2024');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => void api.encounters().then(setSaved).catch(() => {}), []);
  useEffect(() => {
    if (status?.ddb === 'ok') api.campaigns().then(setCampaigns).catch(() => {});
  }, [status?.ddb]);
  useEffect(() => {
    if (!encounterId) return setEnc(blank());
    const found = saved.find((e) => e.id === encounterId);
    if (found) setEnc(found);
  }, [encounterId, saved]);

  // Load the campaign roster with levels from each character sheet.
  useEffect(() => {
    const cid = enc.campaign?.id;
    if (!cid) {
      setParty(enc.partyLevels.map((level, i) => ({ id: null, name: `PC ${i + 1}`, level, include: true })));
      return;
    }
    let alive = true;
    api
      .campaignCharacters(cid)
      .then(async (roster) => {
        const members = await Promise.all(
          roster.map(async (r) => {
            const level = await api.character(r.id).then((s) => s.level).catch(() => 1);
            return { id: r.id, name: r.name, level, avatarUrl: r.avatarUrl, include: true };
          }),
        );
        if (alive) setParty(members);
      })
      .catch((e) => setMessage(e.message));
    return () => {
      alive = false;
    };
  }, [enc.campaign?.id]);

  const levels = party.filter((p) => p.include).map((p) => p.level);
  const xps = enc.monsters.flatMap((m) => Array(m.count).fill(m.xp) as number[]);
  const d14 = difficulty2014(levels, xps);
  const d24 = difficulty2024(levels, xps);

  const save = async () => {
    const doc = { ...enc, partyLevels: levels };
    await api.saveEncounter(doc);
    setSaved(await api.encounters());
    setMessage('Saved.');
    if (!encounterId) nav(`/builder/${doc.id}`, { replace: true });
  };

  const run = async () => {
    setBusy(true);
    try {
      const statBlocks = await api.monsters(enc.monsters.map((m) => m.ddbId));
      const events: CombatEventBody[] = [];
      for (const p of party) {
        if (!p.include) continue;
        events.push({
          type: 'combatant/added',
          combatant: p.id ? pcCombatant({ id: p.id, name: p.name, avatarUrl: p.avatarUrl }) : { ...pcCombatant({ id: 0, name: p.name }), id: uuid(), source: undefined, hp: { current: 10, max: 10, temp: 0 } },
        });
      }
      for (const m of enc.monsters) {
        const sb = statBlocks[m.ddbId];
        if (!sb) continue;
        for (let i = 0; i < m.count; i++) {
          const combatant = monsterToCombatant(sb, { id: uuid(), name: m.count > 1 ? `${sb.name} (${letterSuffix(i)})` : sb.name });
          events.push(i === 0 ? { type: 'combatant/added', combatant, statBlock: sb } : { type: 'combatant/added', combatant });
        }
      }
      const res = await api.createCombat(enc.name, enc.campaign, events);
      nav(`/dm/${res.id}`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addMonster = (sb: MonsterStatBlock) => {
    if (!sb.ddbId) return;
    setEnc((e) => {
      const existing = e.monsters.find((m) => m.ddbId === sb.ddbId);
      if (existing) return { ...e, monsters: e.monsters.map((m) => (m === existing ? { ...m, count: m.count + 1 } : m)) };
      return { ...e, monsters: [...e.monsters, { ddbId: sb.ddbId!, name: sb.name, count: 1, xp: sb.xp, cr: sb.cr }] };
    });
  };

  return (
    <main className="page stack">
      <DdbStatusBanner status={status?.ddb} />
      <div className="row">
        <input style={{ fontSize: '1.3rem', fontWeight: 700 }} className="grow" value={enc.name} onChange={(e) => setEnc({ ...enc, name: e.target.value })} aria-label="Encounter name" />
        <button onClick={save}>Save</button>
        <button className="primary" disabled={busy || (enc.monsters.length === 0 && party.length === 0)} onClick={run}>
          {busy ? 'Starting…' : 'Run encounter ▶'}
        </button>
      </div>
      {message && <div className="banner">{message}</div>}

      <div className="grid2">
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Party</h2>
          <label className="row">
            Campaign
            <select
              value={enc.campaign?.id ?? ''}
              onChange={(e) => {
                const c = campaigns.find((x) => x.id === Number(e.target.value));
                setEnc({ ...enc, campaign: c ? { id: c.id, name: c.name } : null });
              }}
            >
              <option value="">None (enter levels manually)</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <ul className="list">
            {party.map((p, i) => (
              <li key={p.id ?? i}>
                <input type="checkbox" checked={p.include} onChange={(e) => setParty(party.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))} aria-label={`Include ${p.name}`} />
                <span className="grow">{p.name}</span>
                Lv
                <input type="number" min={1} max={20} value={p.level} onChange={(e) => setParty(party.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) } : x)))} />
                {!enc.campaign && (
                  <button className="small ghost" onClick={() => setParty(party.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!enc.campaign && (
            <div>
              <button className="small" onClick={() => setParty([...party, { id: null, name: `PC ${party.length + 1}`, level: party.at(-1)?.level ?? 1, include: true }])}>
                + Add PC
              </button>
            </div>
          )}

          <h2 style={{ margin: '8px 0 0' }}>Difficulty</h2>
          <div className="row">
            <button className={`small ${rules === '2024' ? 'primary' : ''}`} onClick={() => setRules('2024')}>
              2024 rules
            </button>
            <button className={`small ${rules === '2014' ? 'primary' : ''}`} onClick={() => setRules('2014')}>
              2014 rules
            </button>
          </div>
          {rules === '2024' ? (
            <div>
              <strong style={{ fontSize: '1.2rem' }}>{d24.rating}</strong>: {d24.xp.toLocaleString()} XP
              <div className="muted">
                Budget: Low {d24.budget.low.toLocaleString()} · Moderate {d24.budget.moderate.toLocaleString()} · High {d24.budget.high.toLocaleString()}
              </div>
            </div>
          ) : (
            <div>
              <strong style={{ fontSize: '1.2rem' }}>{d14.rating}</strong>: {d14.adjustedXp.toLocaleString()} adjusted XP ({d14.rawXp.toLocaleString()} × {d14.multiplier})
              <div className="muted">
                Easy {d14.thresholds.easy.toLocaleString()} · Medium {d14.thresholds.medium.toLocaleString()} · Hard {d14.thresholds.hard.toLocaleString()} · Deadly{' '}
                {d14.thresholds.deadly.toLocaleString()}
              </div>
            </div>
          )}
          {levels.length > 0 && <small className="muted">{Math.round(d14.rawXp / levels.length).toLocaleString()} XP per player</small>}
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>Monsters</h2>
          <ul className="list">
            {enc.monsters.map((m) => (
              <li key={m.ddbId}>
                <span className="grow">
                  <strong>{m.name}</strong> <small className="muted">CR {m.cr} · {m.xp.toLocaleString()} XP</small>
                </span>
                <input
                  type="number"
                  min={0}
                  value={m.count}
                  aria-label={`Number of ${m.name}`}
                  onChange={(e) => {
                    const count = Math.max(0, Number(e.target.value));
                    setEnc({ ...enc, monsters: count === 0 ? enc.monsters.filter((x) => x !== m) : enc.monsters.map((x) => (x === m ? { ...x, count } : x)) });
                  }}
                />
              </li>
            ))}
            {enc.monsters.length === 0 && <li className="muted">Search below to add monsters.</li>}
          </ul>
          <MonsterSearch onAdd={addMonster} />
        </section>
      </div>

      {saved.length > 0 && (
        <section className="card stack">
          <div className="row">
            <h2 className="grow" style={{ margin: 0 }}>
              Saved encounters
            </h2>
            <Link to="/builder">+ New</Link>
          </div>
          <ul className="list">
            {saved.map((s) => (
              <li key={s.id}>
                <Link className="grow" to={`/builder/${s.id}`}>
                  {s.name}
                </Link>
                <small className="muted">
                  {s.campaign?.name ?? 'No campaign'} · {s.monsters.reduce((a, m) => a + m.count, 0)} monsters
                </small>
                <button className="small ghost danger" onClick={() => api.deleteEncounter(s.id).then(() => api.encounters().then(setSaved))}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function MonsterSearch({ onAdd }: { onAdd: (sb: MonsterStatBlock) => void }) {
  const [q, setQ] = useState('');
  const [homebrew, setHomebrew] = useState(false);
  const [results, setResults] = useState<MonsterStatBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!q.trim() && !homebrew) return setResults([]);
    const t = setTimeout(() => {
      api
        .searchMonsters(q.trim(), homebrew)
        .then((r) => {
          setResults(r.monsters);
          setError(null);
        })
        .catch((e) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [q, homebrew]);
  return (
    <div className="stack">
      <div className="row">
        <input className="grow" placeholder="Search D&D Beyond monsters…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="row">
          <input type="checkbox" checked={homebrew} onChange={(e) => setHomebrew(e.target.checked)} /> Homebrew
        </label>
      </div>
      {error && <div className="banner bad">{error}</div>}
      <ul className="list">
        {results.map((m) => (
          <li key={m.id}>
            <span className="grow">
              <strong>{m.name}</strong> {m.isLegacy && <span className="chip">2014</span>}
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                CR {m.cr} · {m.xp.toLocaleString()} XP · AC {m.ac} · HP {m.hp} · Init {signed(m.initBonus)}
              </div>
            </span>
            <button className="small" onClick={() => onAdd(m)}>
              + Add
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function blank(): SavedEncounter {
  return { id: uuid(), name: 'New encounter', campaign: null, monsters: [], partyLevels: [1, 1, 1, 1] };
}
