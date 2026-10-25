import { effectiveAc, effectiveHp, effectiveInitBonus, signed, type CombatEventBody, type Combatant, type PcSnapshot } from '@dnd/core';
import { memo, useState, type KeyboardEvent } from 'react';
import { ago, Avatar, HpBar } from './bits.tsx';

interface Props {
  c: Combatant;
  active: boolean;
  selected: boolean;
  checked: boolean;
  snap?: PcSnapshot;
  now: number;
  dispatch: (...e: CombatEventBody[]) => void;
  onSelect: () => void;
  onCheck: (checked: boolean) => void;
}

export const CombatantRow = memo(function CombatantRow({ c, active, selected, checked, snap, now, dispatch, onSelect, onCheck }: Props) {
  const hp = effectiveHp(c, snap ? { [snap.characterId]: snap } : {});
  const ddbLinked = c.source?.ddbCharacterId !== undefined;
  const conditions = [...(snap?.conditions ?? []).map((x) => ({ id: `ddb-${x.name}`, label: x.level ? `${x.name} ${x.level}` : x.name, ddb: true })), ...c.conditions.map((x) => ({ id: x.id, label: conditionLabel(x), ddb: false }))];
  const legendary = c.resources.find((r) => r.kind === 'uses' && r.reset === 'turnStart');
  const uncharged = c.resources.filter((r) => r.kind === 'recharge' && !r.charged);

  return (
    <li
      className={['crow', active && 'active', selected && 'selected', c.defeated && 'defeated', c.hidden && 'hidden-c', c.kind === 'effect' && 'effect'].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      <input type="checkbox" aria-label={`Select ${c.name}`} checked={checked} onClick={(e) => e.stopPropagation()} onChange={(e) => onCheck(e.target.checked)} />
      <InitiativeInput c={c} bonus={effectiveInitBonus(c, snap)} dispatch={dispatch} />
      <Avatar url={c.avatarUrl ?? snap?.avatarUrl} name={c.name} />
      <div className="crow-main">
        <div className="crow-name">
          <strong>{c.name}</strong>
          {c.hidden && <span className="chip" title="Hidden from the table view">hidden</span>}
          {c.concentration && <span className="chip conc" title="Concentrating">◎ {c.concentration}</span>}
          {snap && snap.deathSaves.fail + snap.deathSaves.success > 0 && hp?.current === 0 && (
            <span className="chip cond">
              Death saves ✓{snap.deathSaves.success} ✗{snap.deathSaves.fail}
            </span>
          )}
        </div>
        <div className="crow-chips">
          {conditions.map((x) => (
            <span key={x.id} className={x.ddb ? 'chip ddb' : 'chip cond'} title={x.ddb ? 'From the D&D Beyond sheet' : undefined}>
              {x.label}
              {!x.ddb && (
                <button
                  aria-label={`Remove ${x.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: 'condition/removed', id: c.id, conditionId: x.id });
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {legendary?.kind === 'uses' && (
            <span className="chip" title="Legendary actions remaining">
              LA {legendary.max - legendary.used}/{legendary.max}
            </span>
          )}
          {uncharged.map((r) => (
            <span key={r.id} className="chip" title="Not recharged">
              {r.name} ✗
            </span>
          ))}
          {c.kind === 'effect' && c.roundsRemaining !== undefined && <span className="chip">{c.roundsRemaining} rds left</span>}
        </div>
      </div>
      <div className="crow-ac" title={c.ac === null && snap?.stats ? 'Armor Class (from the D&D Beyond sheet)' : 'Armor Class'}>
        {effectiveAc(c, snap) ?? '—'}
        <small>AC</small>
      </div>
      <div className="crow-hp" onClick={(e) => e.stopPropagation()}>
        {hp ? (
          <>
            <div className="hp-text">
              <strong>{hp.current}</strong>/{hp.max}
              {hp.temp > 0 && <span className="temp"> +{hp.temp}</span>}
            </div>
            <HpBar hp={hp} />
          </>
        ) : (
          <span className="muted">{ddbLinked ? 'syncing…' : '—'}</span>
        )}
        {ddbLinked ? (
          <small className="muted" title="Read from the player's D&D Beyond sheet">
            {snap ? `DDB · ${ago(snap.fetchedAt, now)}` : 'DDB'}
          </small>
        ) : null}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        {c.hp ? <HpInput id={c.id} dispatch={dispatch} /> : c.concentration ? <HpInput id={c.id} dispatch={dispatch} damageOnly /> : null}
      </div>
    </li>
  );
});

function conditionLabel(x: Combatant['conditions'][number]) {
  const base = x.level ? `${x.name} ${x.level}` : x.name;
  if (x.duration.kind === 'rounds') return `${base} (${x.duration.rounds})`;
  if (x.duration.kind === 'saveEnds') return `${base} (DC ${x.duration.dc})`;
  return base;
}

function InitiativeInput({ c, bonus, dispatch }: { c: Combatant; bonus: number; dispatch: Props['dispatch'] }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = draft.trim() === '' ? null : Number(draft);
    if (v === null || Number.isFinite(v)) {
      if (v !== c.initiative) dispatch({ type: 'initiative/set', id: c.id, value: v });
    }
    setDraft(null);
  };
  return (
    <input
      className="init-input"
      type="number"
      inputMode="numeric"
      aria-label={`Initiative for ${c.name}`}
      title={`Initiative bonus ${signed(bonus)}`}
      value={draft ?? c.initiative ?? ''}
      placeholder={signed(bonus)}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Type a number: Enter = damage, Shift+Enter = heal. */
export function HpInput({ id, dispatch, damageOnly }: { id: string; dispatch: Props['dispatch']; damageOnly?: boolean }) {
  const [v, setV] = useState('');
  const n = Number(v);
  const ok = v !== '' && Number.isFinite(n) && n > 0;
  const go = (type: 'hp/damage' | 'hp/heal' | 'hp/temp') => {
    if (!ok) return;
    dispatch({ type, id, amount: Math.round(n) });
    setV('');
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') go(e.shiftKey ? 'hp/heal' : 'hp/damage');
  };
  return (
    <div className="hp-input">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        placeholder={damageOnly ? 'dmg' : 'HP'}
        title={damageOnly ? 'Damage taken (for the concentration check)' : 'Enter = damage, Shift+Enter = heal'}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={onKey}
      />
      <button className="small" disabled={!ok} onClick={() => go('hp/damage')} title="Damage">
        −
      </button>
      {!damageOnly && (
        <>
          <button className="small" disabled={!ok} onClick={() => go('hp/heal')} title="Heal">
            +
          </button>
          <button className="small" disabled={!ok} onClick={() => go('hp/temp')} title="Set temporary HP">
            T
          </button>
        </>
      )}
    </div>
  );
}
