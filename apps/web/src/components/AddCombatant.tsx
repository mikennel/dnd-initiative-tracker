import { letterSuffix, monsterToCombatant, pcCombatant, rollD20, signed, type CombatEventBody, type CombatState, type MonsterStatBlock, type NewCombatant } from '@dnd/core';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { uuid } from '../lib/ids.ts';
import { Modal } from './bits.tsx';

type Tab = 'monster' | 'pc' | 'npc' | 'effect';

interface Props {
  open: boolean;
  onClose: () => void;
  state: CombatState;
  dispatch: (...e: CombatEventBody[]) => void;
}

/** Add anything mid-combat: DDB monsters, campaign PCs, ad-hoc NPCs, and lair/environment effects. */
export function AddCombatant({ open, onClose, state, dispatch }: Props) {
  const [tab, setTab] = useState<Tab>('monster');
  // Combatants added after combat starts get initiative rolled immediately by default.
  const [rollNow, setRollNow] = useState(true);
  const add = (combatants: NewCombatant[], label: string, statBlock?: MonsterStatBlock) => {
    const shouldRoll = state.started && rollNow;
    const events: CombatEventBody[] = combatants.map((c, i) => ({
      type: 'combatant/added',
      combatant: shouldRoll && c.initiative === null && c.kind !== 'pc' ? { ...c, initiative: rollD20(c.initBonus).total } : c,
      ...(i === 0 && statBlock ? { statBlock } : {}),
    }));
    dispatch(events.length === 1 ? events[0] : { type: 'batch', label, events });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add to combat" wide>
      <div className="tabs">
        {(['monster', 'pc', 'npc', 'effect'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {{ monster: 'Monster', pc: 'Player character', npc: 'NPC / custom', effect: 'Lair / environment' }[t]}
          </button>
        ))}
      </div>
      {state.started && (
        <label className="row muted" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={rollNow} onChange={(e) => setRollNow(e.target.checked)} /> Roll initiative for new monsters/NPCs now
        </label>
      )}
      {tab === 'monster' && <MonsterTab state={state} add={add} />}
      {tab === 'pc' && <PcTab state={state} add={add} />}
      {tab === 'npc' && <NpcTab add={add} />}
      {tab === 'effect' && <EffectTab add={add} />}
    </Modal>
  );
}

type AddFn = (c: NewCombatant[], label: string, statBlock?: MonsterStatBlock) => void;

function MonsterTab({ state, add }: { state: CombatState; add: AddFn }) {
  const [q, setQ] = useState('');
  const [homebrew, setHomebrew] = useState(false);
  const [results, setResults] = useState<MonsterStatBlock[]>([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(1);
  const [hpMode, setHpMode] = useState<'average' | 'roll'>('average');
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!q.trim() && !homebrew) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api
        .searchMonsters(q.trim(), homebrew)
        .then((r) => {
          setResults(r.monsters);
          setOffline(!!r.offline);
          setError(null);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, homebrew]);

  const addMonster = (sb: MonsterStatBlock) => {
    const existing = Object.values(state.combatants).filter((c) => c.group === sb.name).length;
    const multi = count > 1 || existing > 0;
    const list = Array.from({ length: count }, (_, i) =>
      monsterToCombatant(sb, { id: uuid(), name: multi ? `${sb.name} (${letterSuffix(existing + i)})` : sb.name, hp: hpMode, hidden }),
    );
    add(list, `Add ${count} × ${sb.name}`, state.statBlocks[String(sb.ddbId)] ? undefined : sb);
  };

  return (
    <div className="stack">
      <div className="row">
        <input className="grow" autoFocus placeholder="Search D&D Beyond monsters…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="row">
          <input type="checkbox" checked={homebrew} onChange={(e) => setHomebrew(e.target.checked)} /> My homebrew
        </label>
      </div>
      <div className="row muted">
        Count <input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} />
        HP
        <select value={hpMode} onChange={(e) => setHpMode(e.target.value as typeof hpMode)}>
          <option value="average">Average</option>
          <option value="roll">Roll</option>
        </select>
        <label className="row">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden from players
        </label>
      </div>
      {offline && <div className="banner">D&D Beyond is unreachable; showing monsters cached on this machine.</div>}
      {error && <div className="banner bad">{error}</div>}
      {loading && <small className="muted">Searching…</small>}
      <ul className="list">
        {results.map((m) => (
          <li key={m.id}>
            {m.avatarUrl ? <img className="avatar" src={m.avatarUrl} alt="" /> : <span className="avatar placeholder">{m.name[0]}</span>}
            <div className="grow">
              <strong>{m.name}</strong> {m.isLegacy && <span className="chip">2014</span>} {m.isHomebrew && <span className="chip">homebrew</span>}
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                CR {m.cr} · AC {m.ac} · HP {m.hp} · Init {signed(m.initBonus)} · {m.size} {m.type}
              </div>
            </div>
            <button className="small primary" onClick={() => addMonster(m)}>
              Add{count > 1 ? ` ×${count}` : ''}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PcTab({ state, add }: { state: CombatState; add: AddFn }) {
  const [roster, setRoster] = useState<{ id: number; name: string; userName: string; avatarUrl: string | null }[] | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: number; name: string }[]>([]);
  const [campaignId, setCampaignId] = useState<number | null>(state.campaign?.id ?? null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.campaigns().then(setCampaigns).catch(() => {});
  }, []);
  useEffect(() => {
    if (!campaignId) return;
    setRoster(null);
    api.campaignCharacters(campaignId).then(setRoster).catch((e) => setError(e.message));
  }, [campaignId]);

  const inCombat = new Set(Object.values(state.combatants).map((c) => c.source?.ddbCharacterId));
  return (
    <div className="stack">
      <label className="row">
        Campaign
        <select value={campaignId ?? ''} onChange={(e) => setCampaignId(Number(e.target.value) || null)}>
          <option value="">Choose…</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error && <div className="banner bad">{error}</div>}
      <ul className="list">
        {roster?.map((p) => (
          <li key={p.id}>
            {p.avatarUrl ? <img className="avatar" src={p.avatarUrl} alt="" /> : <span className="avatar placeholder">{p.name[0]}</span>}
            <div className="grow">
              <strong>{p.name}</strong> <small className="muted">{p.userName}</small>
            </div>
            <button className="small primary" disabled={inCombat.has(p.id)} onClick={() => add([pcCombatant(p)], `Add ${p.name}`)}>
              {inCombat.has(p.id) ? 'In combat' : 'Add'}
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <input className="grow" placeholder="Or a PC not on D&D Beyond (local HP)" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          disabled={!name.trim()}
          onClick={() =>
            add([{ ...baseCombatant(name.trim()), kind: 'pc', hp: { current: 10, max: 10, temp: 0 } }], `Add ${name.trim()}`)
          }
        >
          Add local PC
        </button>
      </div>
    </div>
  );
}

function NpcTab({ add }: { add: AddFn }) {
  const [name, setName] = useState('');
  const [ac, setAc] = useState(12);
  const [hp, setHp] = useState(10);
  const [init, setInit] = useState(0);
  const [count, setCount] = useState(1);
  const [kind, setKind] = useState<'npc' | 'monster'>('npc');
  const go = () => {
    const list = Array.from({ length: count }, (_, i) => ({
      ...baseCombatant(count > 1 ? `${name.trim()} (${letterSuffix(i)})` : name.trim()),
      kind,
      ac,
      initBonus: init,
      hp: { current: hp, max: hp, temp: 0 },
      group: name.trim(),
    }));
    add(list, `Add ${name.trim()}`);
  };
  return (
    <div className="stack">
      <input autoFocus placeholder="Name (e.g. Town Guard, Ally Mage)" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="row">
        <label className="row">
          AC <input type="number" value={ac} onChange={(e) => setAc(Number(e.target.value))} />
        </label>
        <label className="row">
          HP <input type="number" value={hp} onChange={(e) => setHp(Number(e.target.value))} />
        </label>
        <label className="row">
          Init bonus <input type="number" value={init} onChange={(e) => setInit(Number(e.target.value))} />
        </label>
        <label className="row">
          Count <input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} />
        </label>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="npc">Ally / NPC</option>
          <option value="monster">Enemy</option>
        </select>
      </div>
      <div>
        <button className="primary" disabled={!name.trim()} onClick={go}>
          Add
        </button>
      </div>
    </div>
  );
}

const EFFECT_PRESETS = [
  { name: 'Lair Actions', initiative: 20, description: 'On initiative count 20 (losing ties), the creature takes a lair action.' },
  { name: 'Collapsing Ceiling', initiative: 10, description: 'Each creature in the area: DEX save or 2d10 bludgeoning.' },
  { name: 'Rising Water', initiative: 0, description: 'The water rises 1 ft at the end of each round.' },
  { name: 'Reinforcements', initiative: 0, description: 'Reinforcements arrive when this reaches 0.' },
];

function EffectTab({ add }: { add: AddFn }) {
  const [name, setName] = useState('');
  const [initiative, setInitiative] = useState(20);
  const [description, setDescription] = useState('');
  const [rounds, setRounds] = useState('');
  const go = () =>
    add(
      [
        {
          ...baseCombatant(name.trim()),
          kind: 'effect',
          initiative,
          initBonus: -100, // effects lose initiative ties (lair actions on 20, losing ties)
          hp: null,
          ac: null,
          description: description.trim() || undefined,
          roundsRemaining: rounds === '' ? undefined : Number(rounds),
        },
      ],
      `Add ${name.trim()}`,
    );
  return (
    <div className="stack">
      <div className="row">
        {EFFECT_PRESETS.map((p) => (
          <button
            key={p.name}
            className="small"
            onClick={() => {
              setName(p.name);
              setInitiative(p.initiative);
              setDescription(p.description);
            }}
          >
            {p.name}
          </button>
        ))}
      </div>
      <input placeholder="Name (e.g. Spirit Guardians, Burning Rafters)" value={name} onChange={(e) => setName(e.target.value)} />
      <textarea placeholder="What happens on its turn" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="row">
        <label className="row">
          Initiative <input type="number" value={initiative} onChange={(e) => setInitiative(Number(e.target.value))} />
        </label>
        <label className="row">
          Lasts <input type="number" min={1} placeholder="∞" value={rounds} onChange={(e) => setRounds(e.target.value)} /> rounds
        </label>
      </div>
      <div>
        <button className="primary" disabled={!name.trim()} onClick={go}>
          Add effect
        </button>
      </div>
    </div>
  );
}

function baseCombatant(name: string): NewCombatant {
  return {
    id: uuid(),
    kind: 'npc',
    name,
    initiative: null,
    initBonus: 0,
    ac: null,
    hp: null,
    hidden: false,
    defeated: false,
    conditions: [],
    concentration: null,
    resources: [],
    notes: '',
  };
}
