import { rollD20, rollDie, signed, type CombatEventBody, type CombatPrompt, type CombatState } from '@dnd/core';
import { useToast } from './bits.tsx';
import { saveBonus } from './StatBlock.tsx';

/** Things the reducer wants the DM to resolve: concentration saves, recharge rolls, save-ends, expiring effects. */
export function Prompts({ state, dispatch }: { state: CombatState; dispatch: (...e: CombatEventBody[]) => void }) {
  const toast = useToast();
  if (state.prompts.length === 0) return null;

  const dismiss = (p: CombatPrompt): CombatEventBody => ({ type: 'prompt/dismissed', promptId: p.id });

  return (
    <div className="prompts">
      {state.prompts.map((p) => {
        const c = state.combatants[p.combatantId];
        if (!c) return null;
        const sb = c.source?.ddbMonsterId !== undefined ? state.statBlocks[String(c.source.ddbMonsterId)] : undefined;
        const canRollSave = c.kind !== 'pc' && p.ability;
        const rollSave = () => {
          const bonus = saveBonus(sb, p.ability!);
          const r = rollD20(bonus);
          const pass = r.total >= (p.dc ?? 10);
          toast(`${c.name} ${p.ability!.toUpperCase()} save: ${r.total} (d20 ${r.roll} ${signed(bonus)}) vs DC ${p.dc}: ${pass ? 'success' : 'failure'}`);
          return pass;
        };
        return (
          <div key={p.id} className={`prompt prompt-${p.kind}`}>
            <span className="grow">{p.text}</span>
            {p.kind === 'concentration' && (
              <>
                {canRollSave && (
                  <button className="small" onClick={() => (rollSave() ? dispatch(dismiss(p)) : dispatch({ type: 'batch', label: `${c.name} loses concentration`, events: [{ type: 'concentration/set', id: c.id, spell: null }, dismiss(p)] }))}>
                    🎲 Roll
                  </button>
                )}
                <button className="small" onClick={() => dispatch(dismiss(p))}>
                  Kept it
                </button>
                <button className="small" onClick={() => dispatch({ type: 'batch', label: `${c.name} loses concentration`, events: [{ type: 'concentration/set', id: c.id, spell: null }, dismiss(p)] })}>
                  Lost it
                </button>
              </>
            )}
            {p.kind === 'recharge' && p.resourceId && (
              <>
                <button
                  className="small"
                  onClick={() => {
                    const res = c.resources.find((r) => r.id === p.resourceId);
                    const n = rollDie(6);
                    const charged = res?.kind === 'recharge' ? n >= res.min : n >= 5;
                    toast(`${c.name} recharge roll: ${n}: ${charged ? 'recharged!' : 'not yet'}`);
                    dispatch({ type: 'resource/recharge', id: c.id, resourceId: p.resourceId!, charged, roll: n });
                  }}
                >
                  🎲 Roll d6
                </button>
                <button className="small ghost" onClick={() => dispatch(dismiss(p))}>
                  Skip
                </button>
              </>
            )}
            {p.kind === 'save' && p.conditionId && (
              <>
                {canRollSave && (
                  <button
                    className="small"
                    onClick={() => {
                      const pass = rollSave();
                      dispatch(pass ? { type: 'batch', label: `${c.name} saves`, events: [{ type: 'condition/removed', id: c.id, conditionId: p.conditionId! }, dismiss(p)] } : dismiss(p));
                    }}
                  >
                    🎲 Roll
                  </button>
                )}
                <button className="small" onClick={() => dispatch({ type: 'batch', label: `${c.name} saves`, events: [{ type: 'condition/removed', id: c.id, conditionId: p.conditionId! }, dismiss(p)] })}>
                  Saved
                </button>
                <button className="small" onClick={() => dispatch(dismiss(p))}>
                  Failed
                </button>
              </>
            )}
            {p.kind === 'effect' && (
              <>
                <button className="small" onClick={() => dispatch({ type: 'batch', label: `Remove ${c.name}`, events: [dismiss(p), { type: 'combatant/removed', id: c.id }] })}>
                  Remove effect
                </button>
                <button className="small ghost" onClick={() => dispatch(dismiss(p))}>
                  Keep
                </button>
              </>
            )}
            {(p.kind === 'expired' || !['concentration', 'recharge', 'save', 'effect'].includes(p.kind)) && (
              <button className="small ghost" onClick={() => dispatch(dismiss(p))}>
                OK
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
