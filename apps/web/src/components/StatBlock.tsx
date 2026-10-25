import { abilityMod, rollExpression, signed, type MonsterStatBlock, type StatBlockSection } from '@dnd/core';
import type { MouseEvent } from 'react';
import { useToast } from './bits.tsx';
import './statblock.css';

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

/** Renders a DDB stat block. Dice spans (`data-dicenotation`) are clickable and roll locally. */
export function StatBlock({ sb }: { sb: MonsterStatBlock }) {
  const toast = useToast();
  const onClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[data-dicenotation]') as HTMLElement | null;
    if (!el) return;
    e.preventDefault();
    const expr = el.dataset.dicenotation!;
    const r = rollExpression(expr.replace(/\s/g, ''));
    if (!r) return;
    const what = [el.dataset.rollaction, el.dataset.rolltype].filter(Boolean).join(' ');
    const crit = el.dataset.rolltype === 'to hit' && r.rolls[0] === 20 ? ' — CRIT!' : el.dataset.rolltype === 'to hit' && r.rolls[0] === 1 ? ' — nat 1' : '';
    toast(`${sb.name} ${what}: ${r.total} (${expr} → [${r.rolls.join(', ')}])${crit}`);
  };

  return (
    <div className="statblock" onClick={onClick}>
      <div className="sb-head">
        <h2>{sb.name}</h2>
        <em>
          {sb.size} {sb.type}
          {sb.alignment ? `, ${sb.alignment}` : ''}
          {sb.isLegacy ? ' · 2014' : ''}
          {sb.isHomebrew ? ' · Homebrew' : ''}
        </em>
      </div>
      <dl className="sb-props">
        <div><dt>AC</dt><dd>{sb.ac}{sb.acNote ? ` (${sb.acNote})` : ''}</dd></div>
        <div><dt>HP</dt><dd>{sb.hp}{sb.hpDice ? ` (${sb.hpDice})` : ''}</dd></div>
        <div><dt>Speed</dt><dd>{sb.speed || '—'}</dd></div>
        <div><dt>Initiative</dt><dd>{signed(sb.initBonus)}</dd></div>
      </dl>
      <table className="sb-abilities">
        <tbody>
          <tr>{ABILITIES.map((a) => <th key={a}>{a.toUpperCase()}</th>)}</tr>
          <tr>
            {ABILITIES.map((a) => (
              <td key={a}>
                {sb.abilities[a]} ({signed(abilityMod(sb.abilities[a]))})
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <dl className="sb-props">
        {sb.saves && <div><dt>Saving Throws</dt><dd>{sb.saves}</dd></div>}
        {sb.skills && <div><dt>Skills</dt><dd>{sb.skills}</dd></div>}
        {sb.vulnerabilities && <div><dt>Vulnerabilities</dt><dd>{sb.vulnerabilities}</dd></div>}
        {sb.resistances && <div><dt>Resistances</dt><dd>{sb.resistances}</dd></div>}
        {sb.immunities && <div><dt>Immunities</dt><dd>{sb.immunities}</dd></div>}
        {sb.conditionImmunities && <div><dt>Condition Immunities</dt><dd>{sb.conditionImmunities}</dd></div>}
        {sb.senses && <div><dt>Senses</dt><dd>{sb.senses}</dd></div>}
        <div><dt>Languages</dt><dd>{sb.languages}</dd></div>
        <div><dt>CR</dt><dd>{sb.cr} ({sb.xp.toLocaleString()} XP; PB {signed(sb.proficiencyBonus)})</dd></div>
      </dl>
      <Section title="Traits" s={sb.sections.traits} />
      <Section title="Actions" s={sb.sections.actions} />
      <Section title="Bonus Actions" s={sb.sections.bonusActions} />
      <Section title="Reactions" s={sb.sections.reactions} />
      <Section title="Legendary Actions" s={sb.sections.legendary} />
      <Section title="Mythic Actions" s={sb.sections.mythic} />
      <Section title="Lair Actions" s={sb.sections.lair} />
      {sb.ddbUrl && (
        <p>
          <a href={sb.ddbUrl} target="_blank" rel="noreferrer">
            View on D&D Beyond ↗
          </a>
        </p>
      )}
    </div>
  );
}

function Section({ title, s }: { title: string; s?: StatBlockSection }) {
  if (!s) return null;
  return (
    <section>
      <h3 className="sb-section">{title}</h3>
      {/* HTML comes from DDB and is sanitized in core (sanitizeHtml). */}
      <div className="sb-html" dangerouslySetInnerHTML={{ __html: s.html }} />
    </section>
  );
}

/** Save bonus for an ability from the stat block's listed saves, else the raw modifier. */
export function saveBonus(sb: MonsterStatBlock | undefined, ability: string): number {
  if (!sb) return 0;
  const m = new RegExp(`${ability}\\s*([+\\-−]\\d+)`, 'i').exec(sb.saves);
  if (m) return Number(m[1].replace('−', '-'));
  return abilityMod(sb.abilities[ability.toLowerCase() as (typeof ABILITIES)[number]] ?? 10);
}
