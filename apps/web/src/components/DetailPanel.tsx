import {
  QUICK_EFFECTS,
  STANDARD_CONDITIONS,
  rollDie,
  signed,
  type AbilityKey,
  type CombatEventBody,
  type Combatant,
  type CombatState,
  type ConditionDuration,
  type PcSnapshot,
  type Resource,
} from '@dnd/core';
import { useState } from 'react';
import { HP_SCALES, hpScale, scaleHpEvents } from '../lib/actions.ts';
import { uuid } from '../lib/ids.ts';
import { imageToAvatar } from '../lib/image.ts';
import { ago, Avatar } from './bits.tsx';
import { StatBlock } from './StatBlock.tsx';

interface Props {
  c: Combatant;
  state: CombatState;
  snap?: PcSnapshot;
  now: number;
  dispatch: (...e: CombatEventBody[]) => void;
  /** Apply a condition to every checked combatant, not just this one. */
  targets: string[];
}

export function DetailPanel({ c, state, snap, now, dispatch, targets }: Props) {
  const sb = c.source?.ddbMonsterId !== undefined ? state.statBlocks[String(c.source.ddbMonsterId)] : undefined;
  return (
    <div className="stack">
      <Header c={c} sb={sb} dispatch={dispatch} />
      {snap && <PcSheet snap={snap} now={now} />}
      <ConditionEditor c={c} state={state} dispatch={dispatch} targets={targets} />
      <Concentration c={c} dispatch={dispatch} />
      {(c.resources.length > 0 || c.kind !== 'pc') && <Resources c={c} dispatch={dispatch} />}
      {c.kind === 'effect' && <EffectEditor c={c} dispatch={dispatch} />}
      <Notes c={c} dispatch={dispatch} />
      {sb && (
        <div className="card">
          <StatBlock sb={sb} />
        </div>
      )}
    </div>
  );
}

function Header({ c, sb, dispatch }: { c: Combatant; sb?: { name: string; avatarUrl: string | null }; dispatch: Props['dispatch'] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [avatar, setAvatar] = useState(c.avatarUrl ?? '');
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [ac, setAc] = useState(String(c.ac ?? ''));
  const [maxHp, setMaxHp] = useState(String(c.hp?.max ?? ''));
  const [curHp, setCurHp] = useState(String(c.hp?.current ?? ''));
  const [initBonus, setInitBonus] = useState(String(c.initBonus));
  const save = () => {
    const events: CombatEventBody[] = [
      {
        type: 'combatant/updated',
        id: c.id,
        patch: { name: name.trim() || c.name, ac: ac === '' ? null : Number(ac), initBonus: Number(initBonus) || 0, avatarUrl: avatar.trim() },
      },
    ];
    if (c.hp && (Number(maxHp) !== c.hp.max || Number(curHp) !== c.hp.current)) events.push({ type: 'hp/set', id: c.id, max: Number(maxHp), current: Number(curHp) });
    dispatch(events.length > 1 ? { type: 'batch', label: `Edit ${c.name}`, events } : events[0]);
    setEditing(false);
  };
  if (!editing) {
    return (
      <div className="row">
        <h2 className="grow" style={{ margin: 0 }}>
          {c.name} <small className="muted">{c.kind}</small>
        </h2>
        <button
          className="small"
          onClick={() => {
            setName(c.name);
            setAvatar(c.avatarUrl ?? '');
            setPictureError(null);
            setAc(String(c.ac ?? ''));
            setMaxHp(String(c.hp?.max ?? ''));
            setCurHp(String(c.hp?.current ?? ''));
            setInitBonus(String(c.initBonus));
            setEditing(true);
          }}
        >
          Edit
        </button>
        <button className="small" onClick={() => dispatch({ type: 'combatant/updated', id: c.id, patch: { hidden: !c.hidden } })} title="Hidden combatants don't appear on the table view">
          {c.hidden ? 'Reveal' : 'Hide'}
        </button>
        {c.kind !== 'pc' && (
          <button className="small" onClick={() => dispatch({ type: 'combatant/updated', id: c.id, patch: { defeated: !c.defeated } })}>
            {c.defeated ? 'Revive' : 'Defeat'}
          </button>
        )}
        <button className="small danger" onClick={() => dispatch({ type: 'combatant/removed', id: c.id })}>
          Remove
        </button>
        {c.kind !== 'pc' && c.hp && (
          <div className="row" style={{ flexBasis: '100%', gap: 4 }}>
            <small className="muted">
              {sb && c.name !== sb.name && !c.name.startsWith(sb.name) ? `${sb.name} · ` : ''}HP
            </small>
            {HP_SCALES.map((f) => (
              <button
                key={f}
                className={hpScale(c) === f ? 'small primary' : 'small'}
                aria-pressed={hpScale(c) === f}
                title={f === 1 ? `Original max HP (${c.hpBase ?? c.hp!.max})` : `${f}× the original max HP (${Math.round((c.hpBase ?? c.hp!.max) * f)})`}
                onClick={() => dispatch(...scaleHpEvents([c], f))}
              >
                ×{f}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      setAvatar(await imageToAvatar(file));
      setPictureError(null);
    } catch {
      setPictureError("That file couldn't be read as an image.");
    }
  };
  return (
    <div className="card stack">
      <label className="row">
        Name <input className="grow" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row">
        <Avatar url={avatar || undefined} name={name || c.name} />
        <label className="button small">
          Upload picture…
          <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => void upload(e.target.files?.[0])} />
        </label>
        <input
          className="grow"
          placeholder="…or paste an image URL"
          aria-label="Picture URL"
          value={avatar.startsWith('data:') ? '' : avatar}
          onChange={(e) => setAvatar(e.target.value)}
          onPaste={(e) => {
            const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
            if (file) {
              e.preventDefault();
              void upload(file);
            }
          }}
        />
        {sb?.avatarUrl && avatar !== sb.avatarUrl && (
          <button className="small ghost" onClick={() => setAvatar(sb.avatarUrl!)}>
            Original
          </button>
        )}
        {avatar && (
          <button className="small ghost" onClick={() => setAvatar('')}>
            None
          </button>
        )}
      </div>
      {pictureError && <div className="banner bad">{pictureError}</div>}
      <div className="row">
        <label className="row">
          AC <input type="number" value={ac} onChange={(e) => setAc(e.target.value)} />
        </label>
        <label className="row">
          Init bonus <input type="number" value={initBonus} onChange={(e) => setInitBonus(e.target.value)} />
        </label>
        {c.hp && (
          <>
            <label className="row">
              HP <input type="number" value={curHp} onChange={(e) => setCurHp(e.target.value)} />
            </label>
            <label className="row">
              Max <input type="number" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} />
            </label>
          </>
        )}
      </div>
      <div className="row">
        <button className="primary" onClick={save}>
          Save
        </button>
        <button onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  );
}

function PcSheet({ snap, now }: { snap: PcSnapshot; now: number }) {
  return (
    <div className="card stack" style={{ gap: 6 }}>
      <div className="row">
        <strong className="grow">From D&D Beyond (read-only)</strong>
        <small className="muted">synced {ago(snap.fetchedAt, now)}</small>
      </div>
      <div>
        HP <strong>{snap.hp.current}</strong>/{snap.hp.max}
        {snap.hp.temp > 0 && <span className="temp"> +{snap.hp.temp} temp</span>} · Level {snap.level}
      </div>
      {snap.stats && <PcStatsView stats={snap.stats} />}
      {snap.hp.current === 0 && (
        <div>
          Death saves: ✓ {snap.deathSaves.success} · ✗ {snap.deathSaves.fail} {snap.deathSaves.stable && '(stable)'}
        </div>
      )}
      {snap.spellSlots.length > 0 && (
        <div className="row" style={{ gap: 4 }}>
          <span className="muted">Slots</span>
          {snap.spellSlots.map((s) => (
            <span key={s.level} className="chip" title={`Level ${s.level}`}>
              {s.level}: {s.max - s.used}/{s.max}
            </span>
          ))}
        </div>
      )}
      {snap.pactSlots.length > 0 && (
        <div className="row" style={{ gap: 4 }}>
          <span className="muted">Pact</span>
          {snap.pactSlots.map((s) => (
            <span key={s.level} className="chip">
              {s.level}: {s.max - s.used}/{s.max}
            </span>
          ))}
        </div>
      )}
      {snap.limitedUses.length > 0 && (
        <div className="row" style={{ gap: 4 }}>
          {snap.limitedUses.map((u) => (
            <span key={u.name} className="chip">
              {u.name} {u.max - u.used}/{u.max}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PcStatsView({ stats }: { stats: NonNullable<PcSnapshot['stats']> }) {
  const defenses = [
    ['Resist', stats.resistances],
    ['Immune', stats.immunities],
    ['Vulnerable', stats.vulnerabilities],
  ] as const;
  return (
    <>
      <div className="muted">
        {stats.race} {stats.classes}
        {stats.inspiration && <span className="chip">Inspiration</span>}
      </div>
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        <span className="chip">AC {stats.ac}</span>
        <span className="chip">Init {signed(stats.initBonus)}</span>
        <span className="chip">Passive Perception {stats.passive.perception}</span>
        <span className="chip">Insight {stats.passive.insight}</span>
        <span className="chip">Investigation {stats.passive.investigation}</span>
        {stats.spellcasting.map((s) => (
          <span key={s.sources.join()} className="chip" title={s.sources.join(', ')}>
            Spell DC {s.dc}
            {s.attack !== null && ` · ${signed(s.attack)} hit`}
          </span>
        ))}
      </div>
      <details>
        <summary className="muted">Saves, speed, senses and defenses</summary>
        <div className="stack" style={{ gap: 4, marginTop: 4 }}>
          {Object.keys(stats.saves).length > 0 && (
            <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
              <span className="muted">Saves</span>
              {Object.entries(stats.saves).map(([k, v]) => (
                <span key={k} className="chip">
                  {k.toUpperCase()} {signed(v)}
                </span>
              ))}
            </div>
          )}
          <div className="muted">{[...stats.speeds, ...stats.senses].join(' · ')}</div>
          {defenses.map(([label, list]) => list.length > 0 && <div key={label}>{label}: {list.join(', ')}</div>)}
        </div>
      </details>
    </>
  );
}

type DurationKind = 'manual' | 'endSource' | 'startSource' | 'rounds' | 'saveEnds';

function ConditionEditor({ c, state, dispatch, targets }: Pick<Props, 'c' | 'state' | 'dispatch' | 'targets'>) {
  const [key, setKey] = useState('');
  const [custom, setCustom] = useState('');
  const [level, setLevel] = useState(1);
  const [dur, setDur] = useState<DurationKind>('manual');
  const [rounds, setRounds] = useState(10);
  const [ability, setAbility] = useState<AbilityKey>('con');
  const [dc, setDc] = useState(13);
  const [sourceId, setSourceId] = useState<string>('');

  const all = [...STANDARD_CONDITIONS, ...QUICK_EFFECTS];
  const info = all.find((x) => x.key === key);
  const source = sourceId || state.activeId || c.id;
  const ids = targets.length > 1 && targets.includes(c.id) ? targets : [c.id];

  const add = () => {
    const name = key === 'custom' ? custom.trim() : info?.name;
    if (!name) return;
    let duration: ConditionDuration = { kind: 'manual' };
    if (dur === 'endSource') duration = { kind: 'rounds', rounds: 1, tick: 'end', anchorId: source };
    if (dur === 'startSource') duration = { kind: 'rounds', rounds: 1, tick: 'start', anchorId: source };
    if (dur === 'rounds') duration = { kind: 'rounds', rounds, tick: 'start', anchorId: source };
    if (dur === 'saveEnds') duration = { kind: 'saveEnds', ability, dc, tick: 'end' };
    const events: CombatEventBody[] = ids.map((id) => ({
      type: 'condition/added',
      id,
      condition: { id: uuid(), key: key === 'custom' ? 'custom' : key, name, level: info?.hasLevels ? level : undefined, sourceId: source !== id ? source : undefined, duration },
    }));
    dispatch(events.length > 1 ? { type: 'batch', label: `${name} on ${events.length} creatures`, events } : events[0]);
    setKey('');
    setCustom('');
  };

  const sourceName = state.combatants[source]?.name ?? 'source';
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <strong>Add condition{ids.length > 1 ? ` to ${ids.length} selected` : ''}</strong>
      <div className="cond-grid">
        {all.map((x) => (
          <button key={x.key} className={`small ${key === x.key ? 'primary' : ''}`} title={x.summary} onClick={() => setKey(key === x.key ? '' : x.key)}>
            {x.name}
          </button>
        ))}
        <button className={`small ${key === 'custom' ? 'primary' : ''}`} onClick={() => setKey('custom')}>
          Custom…
        </button>
      </div>
      {key && (
        <>
          {info && <small className="muted">{info.summary}</small>}
          {key === 'custom' && <input placeholder="Effect name" value={custom} onChange={(e) => setCustom(e.target.value)} autoFocus />}
          {info?.hasLevels && (
            <label className="row">
              Level <input type="number" min={1} max={6} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
            </label>
          )}
          <div className="row">
            <select value={dur} onChange={(e) => setDur(e.target.value as DurationKind)}>
              <option value="manual">Until removed</option>
              <option value="endSource">Until end of {sourceName}'s next turn</option>
              <option value="startSource">Until start of {sourceName}'s next turn</option>
              <option value="rounds">For N rounds</option>
              <option value="saveEnds">Save ends (end of its turn)</option>
            </select>
            {dur === 'rounds' && <input type="number" min={1} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} aria-label="Rounds" />}
            {dur === 'saveEnds' && (
              <>
                <select value={ability} onChange={(e) => setAbility(e.target.value as AbilityKey)}>
                  {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((a) => (
                    <option key={a} value={a}>
                      {a.toUpperCase()}
                    </option>
                  ))}
                </select>
                DC <input type="number" value={dc} onChange={(e) => setDc(Number(e.target.value))} />
              </>
            )}
          </div>
          {(dur === 'endSource' || dur === 'startSource' || dur === 'rounds') && (
            <label className="row">
              Source
              <select value={source} onChange={(e) => setSourceId(e.target.value)}>
                {Object.values(state.combatants).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="row">
            <button className="primary" onClick={add} disabled={key === 'custom' && !custom.trim()}>
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Concentration({ c, dispatch }: { c: Combatant; dispatch: Props['dispatch'] }) {
  const [spell, setSpell] = useState('');
  if (c.concentration) {
    return (
      <div className="row">
        <span className="chip conc">◎ Concentrating on {c.concentration}</span>
        <button className="small" onClick={() => dispatch({ type: 'concentration/set', id: c.id, spell: null })}>
          End
        </button>
      </div>
    );
  }
  return (
    <div className="row">
      <input
        className="grow"
        placeholder="Concentrating on… (spell)"
        value={spell}
        onChange={(e) => setSpell(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && spell.trim()) {
            dispatch({ type: 'concentration/set', id: c.id, spell: spell.trim() });
            setSpell('');
          }
        }}
      />
      <button
        className="small"
        disabled={!spell.trim()}
        onClick={() => {
          dispatch({ type: 'concentration/set', id: c.id, spell: spell.trim() });
          setSpell('');
        }}
      >
        Concentrate
      </button>
    </div>
  );
}

function Resources({ c, dispatch }: { c: Combatant; dispatch: Props['dispatch'] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'uses' | 'recharge'>('uses');
  const [max, setMax] = useState(1);
  const add = () => {
    if (!name.trim()) return;
    const resource: Resource =
      kind === 'uses'
        ? { id: uuid(), kind: 'uses', name: name.trim(), max, used: 0, reset: 'day' }
        : { id: uuid(), kind: 'recharge', name: name.trim(), min: max, charged: true };
    dispatch({ type: 'resource/added', id: c.id, resource });
    setName('');
    setAdding(false);
  };
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row">
        <strong className="grow">Abilities & resources</strong>
        <button className="small ghost" onClick={() => setAdding(!adding)}>
          + Add
        </button>
      </div>
      {c.resources.length === 0 && !adding && <small className="muted">None tracked.</small>}
      {c.resources.map((r) => (
        <ResourceRow key={r.id} c={c} r={r} dispatch={dispatch} />
      ))}
      {adding && (
        <div className="row">
          <input className="grow" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="uses">Uses (x/day)</option>
            <option value="recharge">Recharge (N–6)</option>
          </select>
          <input type="number" min={1} max={kind === 'recharge' ? 6 : 99} value={max} onChange={(e) => setMax(Number(e.target.value))} aria-label={kind === 'uses' ? 'Max uses' : 'Recharge on'} />
          <button className="small primary" onClick={add}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}

function ResourceRow({ c, r, dispatch }: { c: Combatant; r: Resource; dispatch: Props['dispatch'] }) {
  const remove = (
    <button className="small ghost" title="Stop tracking" onClick={() => dispatch({ type: 'resource/removed', id: c.id, resourceId: r.id })}>
      ✕
    </button>
  );
  if (r.kind === 'recharge') {
    const roll = () => {
      const n = rollDie(6);
      dispatch({ type: 'resource/recharge', id: c.id, resourceId: r.id, charged: n >= r.min, roll: n });
    };
    return (
      <div className="row">
        <span className="grow">
          {r.name} <small className="muted">Recharge {r.min}–6</small>
        </span>
        {r.charged ? (
          <button className="small" onClick={() => dispatch({ type: 'resource/recharge', id: c.id, resourceId: r.id, charged: false })}>
            Use
          </button>
        ) : (
          <>
            <span className="chip">spent{r.lastRoll ? ` (rolled ${r.lastRoll})` : ''}</span>
            <button className="small" onClick={roll}>
              🎲 d6
            </button>
            <button className="small ghost" onClick={() => dispatch({ type: 'resource/recharge', id: c.id, resourceId: r.id, charged: true })}>
              Ready
            </button>
          </>
        )}
        {remove}
      </div>
    );
  }
  if (r.kind === 'uses') {
    return (
      <div className="row">
        <span className="grow">
          {r.name}{' '}
          <small className="muted">
            {r.reset === 'turnStart' ? 'per round' : r.reset === 'day' ? '/day' : r.reset === 'shortRest' ? '/short rest' : r.reset === 'longRest' ? '/long rest' : ''}
            {r.note ? ` · ${r.note}` : ''}
          </small>
        </span>
        <span className="pips" aria-label={`${r.max - r.used} of ${r.max} left`}>
          {Array.from({ length: r.max }, (_, i) => (
            <button
              key={i}
              className={`pip ${i < r.max - r.used ? 'on' : ''}`}
              onClick={() => dispatch({ type: 'resource/used', id: c.id, resourceId: r.id, delta: i < r.max - r.used ? 1 : -1 })}
              aria-label={i < r.max - r.used ? 'Use one' : 'Restore one'}
            />
          ))}
        </span>
        {remove}
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row">
        <span className="grow">{r.name}</span>
        {remove}
      </div>
      {r.slots.map((s) => (
        <div key={s.level} className="row">
          <small className="muted" style={{ width: 52 }}>
            Level {s.level}
          </small>
          <span className="pips">
            {Array.from({ length: s.max }, (_, i) => (
              <button
                key={i}
                className={`pip ${i < s.max - s.used ? 'on' : ''}`}
                onClick={() => dispatch({ type: 'resource/slotUsed', id: c.id, resourceId: r.id, level: s.level, delta: i < s.max - s.used ? 1 : -1 })}
                aria-label={i < s.max - s.used ? 'Use slot' : 'Restore slot'}
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function EffectEditor({ c, dispatch }: { c: Combatant; dispatch: Props['dispatch'] }) {
  return (
    <div className="card stack" style={{ gap: 8 }}>
      {c.description && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{c.description}</p>}
      <label className="row">
        Rounds remaining
        <input
          type="number"
          value={c.roundsRemaining ?? ''}
          placeholder="∞"
          onChange={(e) => dispatch({ type: 'combatant/updated', id: c.id, patch: { roundsRemaining: e.target.value === '' ? undefined : Number(e.target.value) } })}
        />
      </label>
    </div>
  );
}

function Notes({ c, dispatch }: { c: Combatant; dispatch: Props['dispatch'] }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <textarea
      placeholder="DM notes (never shown on the table view)"
      value={draft ?? c.notes}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null && draft !== c.notes) dispatch({ type: 'combatant/updated', id: c.id, patch: { notes: draft } });
        setDraft(null);
      }}
    />
  );
}
