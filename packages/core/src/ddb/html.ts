/**
 * Tiny regex-based HTML helpers for DDB stat block markup. DDB's markup is simple and
 * consistent (`<p>`, `<em>`, `<strong>`, `<span data-dicenotation>`, `<a>`), so we avoid a DOM
 * dependency and keep core runnable in Node and the browser.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', minus: '−', times: '×' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z0-9]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** Strip scripts, event handlers and javascript: URLs; absolutize DDB-relative links. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*(["'])\/(?!\/)/gi, '$1=$2https://www.dndbeyond.com/')
    .replace(/<a\s/gi, '<a target="_blank" rel="noreferrer" ');
}

/** Split into top-level paragraph-ish blocks (`<p>` contents, or the whole string if none). */
export function paragraphs(html: string): string[] {
  const out: string[] = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]);
  if (out.length === 0 && html.trim()) out.push(html);
  return out;
}
