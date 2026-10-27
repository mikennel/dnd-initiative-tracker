import { combatPhase, dyingState, effectiveHp, effectiveInitBonus, healthDescriptor, rollD20, turnOrder, type CombatEventBody, type Combatant, type PcSnapshot } from '@dnd/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AddCombatant } from '../components/AddCombatant.tsx';
import { ToastProvider } from '../components/bits.tsx';
import { CombatantRow, HpInput } from '../components/CombatantRow.tsx';
import { DdbStatusBanner } from '../components/DdbStatusBanner.tsx';
import { DetailPanel } from '../components/DetailPanel.tsx';
import { Flair, type FlairSubject } from '../components/Flair.tsx';
import { HP_SCALES, scaleHpEvents } from '../lib/actions.ts';
import { Prompts } from '../components/Prompts.tsx';
import { useCombat, useNow, useStatus } from '../lib/hooks.ts';
import './tracker.css';

export function Dm() {
  return (
    <ToastProvider>
      <Tracker />
    </ToastProvider>
  );
}

function Tracker() {
  const { combatId = '' } = useParams();
  const { view, dispatch } = useCombat(combatId);
  const { status } = useStatus();
  const now = useNow(1000);
  const { state, undoLabel, redoLabel, pcLive, connection, pendingCount } = view;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [groupInit, setGroupInit] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);

  const order = useMemo(() => turnOrder(state), [state]);
  const focusId = selectedId && state.combatants[selectedId] ? selectedId : state.activeId;
  const focus = focusId ? state.combatants[focusId] : undefined;

  const phase = combatPhase(state);
  const flairSubjects = useMemo(
    () =>
      order
        .filter((c) => c.kind !== 'effect')
        .map((c): FlairSubject => {
          const hp = effectiveHp(c, pcLive);
          const snap = c.source?.ddbCharacterId !== undefined ? pcLive[c.source.ddbCharacterId] : undefined;
          return { id: c.id, name: c.name, avatarUrl: c.avatarUrl || undefined, health: hp ? healthDescriptor(hp) : undefined, dying: dyingState(c, hp, snap) };
        }),
    [order, pcLive],
  );
  const next = useCallback(() => dispatch({ type: 'turn/next' }), [dispatch]);
  /** The big button: setup → show the players their order → start combat → next turn. */
  const advance = useCallback(
    () => (phase === 'setup' ? dispatch({ type: 'combat/lineup', open: true }) : next()),
    [phase, dispatch, next],
  );
  const prev = useCallback(() => dispatch({ type: 'turn/prev' }), [dispatch]);

  // Keyboard: N / Space = next turn, P = previous, Ctrl+Z / Ctrl+Y = undo / redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, dialog')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (e.key === 'n' || e.key === ' ') {
        e.preventDefault();
        advance();
      } else if (e.key === 'p') {
        prev();
      } else if (e.key === 'Escape') {
        setSelectedId(null);
        setChecked(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, advance, prev]);

  // Keep the active combatant scrolled into view.
  useEffect(() => {
    if (state.activeId) document.getElementById(`c-${state.activeId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [state.activeId]);

  const rollInitiative = () => {
    const events: CombatEventBody[] = [];
    const groupRolls = new Map<string, number>();
    for (const c of order) {
      if (c.kind === 'pc' || c.initiative !== null) continue;
      const key = c.group ?? c.id;
      let value = groupInit ? groupRolls.get(key) : undefined;
      if (value === undefined) {
        value = rollD20(c.initBonus).total;
        groupRolls.set(key, value);
      }
      events.push({ type: 'initiative/set', id: c.id, value });
    }
    if (events.length) dispatch({ type: 'batch', label: 'Roll initiative', events });
  };

  /** PCs usually roll their own, but this saves typing when they don't. Uses the sheet's bonus. */
  const rollPcInitiative = () => {
    const events: CombatEventBody[] = order
      .filter((c) => c.kind === 'pc' && c.initiative === null)
      .map((c) => {
        const snap = c.source?.ddbCharacterId !== undefined ? pcLive[c.source.ddbCharacterId] : undefined;
        return { type: 'initiative/set', id: c.id, value: rollD20(effectiveInitBonus(c, snap)).total };
      });
    if (events.length) dispatch({ type: 'batch', label: 'Roll PC initiative', events });
  };

  const unrolled = order.filter((c) => c.initiative === null);
  const checkedIds = [...checked].filter((id) => state.combatants[id]);

  if (view.notFound) {
    return (
      <main className="page">
        <div className="banner bad">
          This combat doesn't exist on the server. <Link to="/">Back to combats</Link>
        </div>
      </main>
    );
  }

  return (
    <div className="tracker">
      <header className="tracker-head">
        <div className="row grow">
          {renaming !== null ? (
            <input
              autoFocus
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              onBlur={() => {
                if (renaming.trim() && renaming !== state.name) dispatch({ type: 'combat/renamed', name: renaming.trim() });
                setRenaming(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <h1 style={{ margin: 0 }} onDoubleClick={() => setRenaming(state.name)} title="Double-click to rename">
              {state.name}
            </h1>
          )}
          {state.campaign && <span className="chip">{state.campaign.name}</span>}
        </div>
        <div className="round">
          {state.started ? (
            <>
              Round <strong>{state.round}</strong>
            </>
          ) : (
            <span className="muted">{phase === 'lineup' ? 'Lineup' : 'Not started'}</span>
          )}
        </div>
        <span className="row muted" title={pendingCount ? `${pendingCount} change(s) not yet saved on the server; they are kept in this browser` : 'All changes saved'}>
          <span className={`dot ${connection}`} />
          {connection === 'online' ? (pendingCount ? `Saving ${pendingCount}…` : 'Saved') : connection === 'offline' ? `Offline${pendingCount ? ` · ${pendingCount} unsynced` : ''}` : 'Connecting…'}
        </span>
      </header>

      <div className="toolbar">
        <button className="primary big" onClick={advance} disabled={order.length === 0} title={{ setup: 'Show the players their initiative order on the table view (N)', lineup: 'Start combat: enemies appear on the table view (N)', active: 'Next turn (N or Space)' }[phase]}>
          {{ setup: 'Show order to players ▶', lineup: 'Start combat ▶', active: 'Next turn ▶' }[phase]}
        </button>
        {phase === 'setup' && order.length > 0 && (
          <button className="ghost" onClick={next} title="Start combat without showing the players their order first">
            Skip lineup
          </button>
        )}
        {phase === 'lineup' && (
          <button className="ghost" onClick={() => dispatch({ type: 'combat/lineup', open: false })}>
            ◀ Back to setup
          </button>
        )}
        <button onClick={prev} disabled={!state.started} title="Previous turn (P)">
          ◀ Prev
        </button>
        <span className="sep" />
        <button onClick={() => dispatch({ type: 'undo' })} disabled={!undoLabel} title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : 'Nothing to undo'}>
          ↶ Undo
        </button>
        <button onClick={() => dispatch({ type: 'redo' })} disabled={!redoLabel} title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : 'Nothing to redo'}>
          ↷ Redo
        </button>
        <span className="sep" />
        <button onClick={rollInitiative} disabled={!unrolled.some((c) => c.kind !== 'pc')} title="Roll for monsters/NPCs without initiative">
          🎲 Roll initiative
        </button>
        <label className="row muted small-label">
          <input type="checkbox" checked={groupInit} onChange={(e) => setGroupInit(e.target.checked)} /> by group
        </label>
        <button onClick={rollPcInitiative} disabled={!unrolled.some((c) => c.kind === 'pc')} title="Roll for players without initiative, using their sheet's bonus">
          🎲 Roll PCs
        </button>
        <span className="sep" />
        <button onClick={() => setAdding(true)}>+ Add</button>
        <span className="grow" />
        <label className="row muted small-label" title="Show Healthy/Bloodied labels for monsters on the table view">
          <input type="checkbox" checked={state.settings.showMonsterHealth} onChange={(e) => dispatch({ type: 'combat/settings', patch: { showMonsterHealth: e.target.checked } })} />
          Monster health on table
        </label>
        <label className="row muted small-label" title="Bloodied, down and death-save animations on this screen and the table view">
          <input type="checkbox" checked={state.settings.effects !== false} onChange={(e) => dispatch({ type: 'combat/settings', patch: { effects: e.target.checked } })} />
          Effects
        </label>
        {state.started && (
          <button className="ghost" onClick={() => dispatch({ type: 'combat/ended' })}>
            End combat
          </button>
        )}
      </div>

      <div className="tracker-banners">
        <DdbStatusBanner status={status?.ddb} />
        {phase === 'setup' && unrolled.some((c) => c.kind === 'pc') && order.length > 0 && (
          <div className="banner">Enter the players' initiative rolls (or roll for them) and roll for monsters, then show the players their order.</div>
        )}
        {phase === 'lineup' && <Lineup order={order} pcLive={pcLive} dispatch={dispatch} />}
        <Prompts state={state} dispatch={dispatch} />
      </div>

      {checkedIds.length > 0 && (
        <div className="multi-bar">
          <strong>{checkedIds.length} selected</strong>
          <MultiHp ids={checkedIds} dispatch={dispatch} />
          {HP_SCALES.map((f) => (
            <button key={f} className="small" title={f === 1 ? 'Restore the original max HP of the selected enemies and NPCs' : `Set the selected enemies and NPCs to ${f}× their original max HP`} onClick={() => dispatch({ type: 'batch', label: `HP ×${f}`, events: scaleHpEvents(checkedIds.map((id) => state.combatants[id]), f) })}>
              HP ×{f}
            </button>
          ))}
          <button
            className="small"
            onClick={() => {
              const hide = checkedIds.some((id) => !state.combatants[id].hidden);
              dispatch({ type: 'batch', label: hide ? 'Hide selected' : 'Reveal selected', events: checkedIds.map((id) => ({ type: 'combatant/updated', id, patch: { hidden: hide } })) });
            }}
          >
            {checkedIds.some((id) => !state.combatants[id].hidden) ? 'Hide' : 'Reveal'}
          </button>
          <button
            className="small danger"
            onClick={() => {
              dispatch({ type: 'batch', label: `Remove ${checkedIds.length}`, events: checkedIds.map((id) => ({ type: 'combatant/removed', id })) });
              setChecked(new Set());
            }}
          >
            Remove
          </button>
          <small className="muted">Conditions added in the side panel apply to all selected.</small>
          <button className="small ghost" onClick={() => setChecked(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="tracker-body">
        <ul className="clist">
          {order.length === 0 && (
            <li className="empty">
              No combatants yet. <button onClick={() => setAdding(true)}>+ Add monsters, players or effects</button>
            </li>
          )}
          {order.map((c) => (
            <div key={c.id} id={`c-${c.id}`}>
              <CombatantRow
                c={c}
                active={state.activeId === c.id}
                selected={focusId === c.id}
                checked={checked.has(c.id)}
                snap={c.source?.ddbCharacterId !== undefined ? pcLive[c.source.ddbCharacterId] : undefined}
                dispatch={dispatch}
                onSelect={() => setSelectedId(c.id)}
                onCheck={(on) =>
                  setChecked((s) => {
                    const n = new Set(s);
                    if (on) n.add(c.id);
                    else n.delete(c.id);
                    return n;
                  })
                }
              />
            </div>
          ))}
        </ul>
        <aside className="detail">
          {focus ? (
            <DetailPanel
              key={focus.id}
              c={focus}
              state={state}
              snap={focus.source?.ddbCharacterId !== undefined ? pcLive[focus.source.ddbCharacterId] : undefined}
              now={now}
              dispatch={dispatch}
              targets={checkedIds}
            />
          ) : (
            <div className="muted">Select a combatant to see details, conditions and their stat block.</div>
          )}
          {state.log.length > 0 && (
            <details className="log">
              <summary>Combat log ({state.log.length})</summary>
              <ol reversed>
                {[...state.log].reverse().slice(0, 80).map((l, i) => (
                  <li key={i}>
                    <small className="muted">R{l.round}</small> {l.text}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </aside>
      </div>

      <Flair subjects={flairSubjects} activeId={state.activeId} live={phase === 'active'} enabled={state.settings.effects !== false} scope={combatId} />
      <AddCombatant open={adding} onClose={() => setAdding(false)} state={state} dispatch={dispatch} />
    </div>
  );
}

/** Apply the same damage/heal to every selected combatant (fireball!). */
function MultiHp({ ids, dispatch }: { ids: string[]; dispatch: (...e: CombatEventBody[]) => void }) {
  const fanOut = (...events: CombatEventBody[]) => {
    const all = ids.flatMap(() => events).map((e, i) => ({ ...e, id: ids[i % ids.length] }) as CombatEventBody);
    dispatch({ type: 'batch', label: `Apply to ${ids.length}`, events: all });
  };
  return <HpInput id="multi" dispatch={fanOut} />;
}

/**
 * Between setup and combat: the table view shows the players their order (and nothing else),
 * and anyone with Alert can swap initiative with a willing ally.
 */
function Lineup({ order, pcLive, dispatch }: { order: Combatant[]; pcLive: Record<number, PcSnapshot>; dispatch: (...e: CombatEventBody[]) => void }) {
  const [from, setFrom] = useState<string | null>(null);
  const pcs = order.filter((c) => c.kind === 'pc');
  const snapOf = (c: Combatant) => (c.source?.ddbCharacterId !== undefined ? pcLive[c.source.ddbCharacterId] : undefined);
  const fromName = pcs.find((c) => c.id === from)?.name;
  const unrolled = pcs.filter((c) => c.initiative === null);
  return (
    <section className="card stack lineup" aria-label="Player initiative order">
      <div className="row">
        <strong className="grow">The table shows the players their order. Swap anyone with Alert, then start combat.</strong>
        {from && (
          <button className="small ghost" onClick={() => setFrom(null)}>
            Cancel swap
          </button>
        )}
      </div>
      {unrolled.length > 0 && <div className="banner bad">No initiative yet for {unrolled.map((c) => c.name).join(', ')}.</div>}
      <ol className="list lineup-list">
        {pcs.map((c) => {
          const alert = snapOf(c)?.feats?.includes('Alert');
          return (
            <li key={c.id} className={from === c.id ? 'swapping' : undefined}>
              <span className="lineup-init">{c.initiative ?? '—'}</span>
              <span className="grow">
                <strong>{c.name}</strong> {alert && <span className="chip" title="Has the Alert feat: may swap initiative with a willing ally">Alert</span>}
              </span>
              {!from && (
                <button className="small" onClick={() => setFrom(c.id)}>
                  Swap…
                </button>
              )}
              {from && from !== c.id && (
                <button
                  className="small primary"
                  onClick={() => {
                    dispatch({ type: 'initiative/swapped', a: from, b: c.id });
                    setFrom(null);
                  }}
                >
                  Swap with {fromName}
                </button>
              )}
              {from === c.id && <small className="muted">Pick who to swap with</small>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
