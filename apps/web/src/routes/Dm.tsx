import { rollD20, turnOrder, type CombatEventBody } from '@dnd/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AddCombatant } from '../components/AddCombatant.tsx';
import { ToastProvider } from '../components/bits.tsx';
import { CombatantRow, HpInput } from '../components/CombatantRow.tsx';
import { DdbStatusBanner } from '../components/DdbStatusBanner.tsx';
import { DetailPanel } from '../components/DetailPanel.tsx';
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

  const next = useCallback(() => dispatch({ type: 'turn/next' }), [dispatch]);
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
        next();
      } else if (e.key === 'p') {
        prev();
      } else if (e.key === 'Escape') {
        setSelectedId(null);
        setChecked(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, next, prev]);

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
            <span className="muted">Not started</span>
          )}
        </div>
        <span className="row muted" title={pendingCount ? `${pendingCount} change(s) not yet saved on the server; they are kept in this browser` : 'All changes saved'}>
          <span className={`dot ${connection}`} />
          {connection === 'online' ? (pendingCount ? `Saving ${pendingCount}…` : 'Saved') : connection === 'offline' ? `Offline${pendingCount ? ` · ${pendingCount} unsynced` : ''}` : 'Connecting…'}
        </span>
      </header>

      <div className="toolbar">
        <button className="primary big" onClick={next} disabled={order.length === 0} title="Next turn (N or Space)">
          {state.started ? 'Next turn ▶' : 'Start combat ▶'}
        </button>
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
        <span className="sep" />
        <button onClick={() => setAdding(true)}>+ Add</button>
        <span className="grow" />
        <label className="row muted small-label" title="Show Healthy/Bloodied labels for monsters on the table view">
          <input type="checkbox" checked={state.settings.showMonsterHealth} onChange={(e) => dispatch({ type: 'combat/settings', patch: { showMonsterHealth: e.target.checked } })} />
          Monster health on table
        </label>
        {state.started && (
          <button className="ghost" onClick={() => dispatch({ type: 'combat/ended' })}>
            End combat
          </button>
        )}
      </div>

      <div className="tracker-banners">
        <DdbStatusBanner status={status?.ddb} />
        {!state.started && unrolled.some((c) => c.kind === 'pc') && order.length > 0 && (
          <div className="banner">Enter the players' initiative rolls, roll for monsters, then start combat.</div>
        )}
        <Prompts state={state} dispatch={dispatch} />
      </div>

      {checkedIds.length > 0 && (
        <div className="multi-bar">
          <strong>{checkedIds.length} selected</strong>
          <MultiHp ids={checkedIds} dispatch={dispatch} />
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
                now={now}
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
