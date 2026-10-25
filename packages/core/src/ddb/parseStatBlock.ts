import type { Resource } from '../combat/types.ts';
import { htmlToText, paragraphs, sanitizeHtml } from './html.ts';
import type { MonsterStatBlock, StatBlockFeature, StatBlockSection } from './types.ts';

/**
 * Parse one DDB description field into named features.
 * Feature paragraphs start with a bold (and usually italic) name ending in "." or ":",
 * e.g. `<p><em><strong>Fire Breath (Recharge 5–6).</strong></em> ...`. Paragraphs without a
 * leading bold name are continuations of the previous feature (or a section preamble).
 */
export function parseSection(html: string | null | undefined): StatBlockSection | undefined {
  if (!html || !html.trim()) return undefined;
  const features: StatBlockFeature[] = [];
  for (const p of paragraphs(html)) {
    const m = /^\s*(?:<(?:em|i)>\s*)?<(strong|b)>([\s\S]*?)<\/\1>/i.exec(p);
    if (m) {
      const name = htmlToText(m[2]).replace(/[.:]\s*$/, '').trim();
      const text = htmlToText(p.slice(m.index + m[0].length)).replace(/^[.:]\s*/, '');
      features.push({ name, text });
    } else {
      const text = htmlToText(p);
      if (features.length) features[features.length - 1].text += `\n${text}`;
      else features.push({ name: '', text });
    }
  }
  return { html: sanitizeHtml(html), features };
}

/**
 * Derive trackable resources from a stat block: recharge abilities, x/Day uses (including
 * Legendary Resistance), legendary action uses, 2024 "N/Day Each" spells, and legacy slots.
 * Resource ids are `${idPrefix}:${n}`, so pass a per-combatant prefix.
 */
export function extractResources(sb: Pick<MonsterStatBlock, 'sections'>, idPrefix = 'r'): Resource[] {
  const out: Resource[] = [];
  let i = 0;
  const id = () => `${idPrefix}:${i++}`;
  const sections = sb.sections;

  for (const key of ['traits', 'actions', 'bonusActions', 'reactions'] as const) {
    for (const f of sections[key]?.features ?? []) {
      const recharge = /\(Recharge (\d)(?:\s*[–\-−]\s*6)?\)/i.exec(f.name);
      if (recharge) {
        out.push({ id: id(), kind: 'recharge', name: stripParen(f.name), min: Number(recharge[1]), charged: true });
        continue;
      }
      const rest = /\(Recharges? after a (Short or )?Long Rest\)/i.exec(f.name);
      if (rest) {
        out.push({ id: id(), kind: 'uses', name: stripParen(f.name), max: 1, used: 0, reset: rest[1] ? 'shortRest' : 'longRest' });
        continue;
      }
      const perDay = /\((\d+)\/Day(?: each)?(?:,? or (\d+)\/Day in Lair)?\)/i.exec(f.name);
      if (perDay) {
        out.push({
          id: id(),
          kind: 'uses',
          name: stripParen(f.name),
          max: Number(perDay[1]),
          used: 0,
          reset: 'day',
          note: perDay[2] ? `${perDay[2]}/Day in lair` : undefined,
        });
      }
      // Spellcasting: 2024 "2/Day Each: ..." lines and legacy "1st level (4 slots): ..." lines,
      // which DDB renders either as their own bold-named paragraphs or inside the feature text.
      out.push(...spellResources(f, id));
    }
  }

  const legendary = sections.legendary?.features ?? [];
  const legText = legendary.map((f) => `${f.name} ${f.text}`).join('\n');
  const legUses = /Legendary Action Uses:\s*(\d+)(?:\s*\((\d+) in Lair\))?/i.exec(legText) ?? /can take (\d+) legendary actions/i.exec(legText);
  if (legUses) {
    out.push({
      id: id(),
      kind: 'uses',
      name: 'Legendary Actions',
      max: Number(legUses[1]),
      used: 0,
      reset: 'turnStart',
      note: legUses[2] ? `${legUses[2]} in lair` : undefined,
    });
  }
  return out;
}

function spellResources(f: StatBlockFeature, id: () => string): Resource[] {
  const out: Resource[] = [];
  const lines = [`${f.name}: ${f.text}`, ...f.text.split('\n')];
  const slots: { level: number; max: number; used: number }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const each = /^\s*(\d+)\/Day(?: Each)?:\s*(.+)$/i.exec(line);
    if (each) {
      for (const spell of splitSpells(each[2])) {
        if (seen.has(spell)) continue;
        seen.add(spell);
        out.push({ id: id(), kind: 'uses', name: spell, max: Number(each[1]), used: 0, reset: 'day' });
      }
    }
    const slot = /^\s*(\d)(?:st|nd|rd|th) level \((\d+) slots?\)/i.exec(line);
    if (slot && !slots.some((s) => s.level === Number(slot[1]))) slots.push({ level: Number(slot[1]), max: Number(slot[2]), used: 0 });
  }
  if (slots.length) out.push({ id: id(), kind: 'slots', name: 'Spell Slots', slots: slots.sort((a, b) => a.level - b.level) });
  return out;
}

function splitSpells(list: string): string[] {
  return list
    .replace(/\([^)]*\)/g, '')
    .split(/,|\band\b/)
    .map((s) => s.replace(/[*.]/g, '').trim())
    .filter((s) => s.length > 1 && s.length < 40);
}

function stripParen(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}
