import type { HealthDescriptor } from '@dnd/core';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import './flair.css';

/**
 * Health-milestone animations for the DM and table screens. Purely presentational: it diffs
 * successive snapshots of what the screen already shows, so nothing new enters the event log
 * and the table never learns more than its projection (ADR 0005).
 */
export interface FlairSubject {
  id: string;
  name: string;
  avatarUrl?: string;
  /** 'Alive' = up, but the screen isn't allowed to know how hurt (monster health hidden on the table). */
  health?: HealthDescriptor | 'Alive';
  dying?: { success: number; fail: number };
}

type FlairKind = 'bloodied' | 'down' | 'deathsave';

interface FlairEvent {
  key: number;
  kind: FlairKind;
  who: FlairSubject[];
}

const DURATION: Record<FlairKind, number> = { bloodied: 2600, down: 3000, deathsave: 4000 };
/** Older moments are dropped rather than replayed long after the fact. */
const MAX_QUEUE = 3;

let nextKey = 1;

/**
 * @param live   only fire during combat (setup HP tweaks stay quiet), but keep tracking
 * @param scope  resets tracking when it changes (another combat), so loading one never fires
 */
export function Flair({ subjects, activeId, live, enabled, scope }: { subjects: FlairSubject[]; activeId: string | null; live: boolean; enabled: boolean; scope: string }) {
  const prev = useRef<{ scope: string; health: Map<string, FlairSubject['health']>; activeId: string | null } | null>(null);
  const [queue, setQueue] = useState<FlairEvent[]>([]);

  useEffect(() => {
    const before = prev.current?.scope === scope ? prev.current : null;
    // Wait for the first real snapshot; an empty one is just "still loading".
    if (!before && subjects.length === 0) return;
    prev.current = { scope, health: new Map(subjects.map((s) => [s.id, s.health])), activeId };
    if (!before || !live || !enabled) return;

    const down: FlairSubject[] = [];
    const bloodied: FlairSubject[] = [];
    for (const s of subjects) {
      const was = before.health.get(s.id);
      if (was === undefined || s.health === undefined || was === s.health) continue;
      if (s.health === 'Down') down.push(s);
      else if (s.health === 'Bloodied' && (was === 'Unhurt' || was === 'Hurt')) bloodied.push(s);
    }
    const events: FlairEvent[] = [];
    if (down.length) events.push({ key: nextKey++, kind: 'down', who: down });
    if (bloodied.length) events.push({ key: nextKey++, kind: 'bloodied', who: bloodied });
    if (activeId && activeId !== before.activeId) {
      const active = subjects.find((s) => s.id === activeId);
      if (active?.dying) events.push({ key: nextKey++, kind: 'deathsave', who: [active] });
    }
    if (events.length) setQueue((q) => [...q, ...events].slice(-MAX_QUEUE));
  }, [subjects, activeId, live, enabled, scope]);

  useEffect(() => {
    if (!enabled) setQueue([]);
  }, [enabled]);

  const current = queue[0];
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), DURATION[current.kind]);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  const dismiss = () => setQueue((q) => q.slice(1));
  return (
    <div className={`flair flair-${current.kind}`} key={current.key} style={{ '--flair-ms': `${DURATION[current.kind]}ms` } as CSSProperties} aria-live="polite">
      {current.kind === 'bloodied' && <Splatter seed={current.key} />}
      {current.kind === 'deathsave' && <Embers seed={current.key} />}
      <div className="flair-card" onClick={dismiss} title="Click to dismiss">
        {current.kind === 'down' && <Skull />}
        <div className="flair-avatars">
          {current.who.slice(0, 4).map((s) => (
            <Avatar key={s.id} s={s} />
          ))}
          {current.who.length > 4 && <span className="flair-avatar flair-more">+{current.who.length - 4}</span>}
        </div>
        <div className="flair-text">{headline(current)}</div>
        {current.kind === 'deathsave' && <DeathSavePips saves={current.who[0].dying!} />}
      </div>
    </div>
  );
}

function headline(e: FlairEvent): string {
  const names = e.who.map((s) => s.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? 'is' : 'are';
  if (e.kind === 'bloodied') return `${list} ${verb} bloodied!`;
  if (e.kind === 'down') return `${list} ${verb} down!`;
  return `${list} is making a death saving throw!`;
}

function Avatar({ s }: { s: FlairSubject }) {
  return s.avatarUrl ? <img className="flair-avatar" src={s.avatarUrl} alt="" /> : <span className="flair-avatar">{s.name[0]}</span>;
}

function DeathSavePips({ saves }: { saves: { success: number; fail: number } }) {
  if (saves.success + saves.fail === 0) return null;
  const pips = (n: number, cls: string) => [0, 1, 2].map((i) => <span key={cls + i} className={`pip ${cls} ${i < n ? 'on' : ''}`} />);
  return (
    <div className="flair-pips">
      <span>{pips(saves.success, 'ok')}</span>
      <span>{pips(saves.fail, 'fail')}</span>
    </div>
  );
}

/** Small seeded PRNG so a splat keeps its shape across re-renders. */
function rng(seed: number) {
  let a = seed * 9301 + 49297;
  return () => {
    a = (a * 1103515245 + 12345) & 0x7fffffff;
    return a / 0x7fffffff;
  };
}

/** A wobbly closed blob around (cx, cy). */
function blob(r: () => number, cx: number, cy: number, radius: number, points = 14): string {
  const pts = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const d = radius * (0.65 + r() * 0.55);
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
  });
  // Smooth through midpoints with quadratic curves.
  const mid = (i: number) => {
    const [x1, y1] = pts[i % points];
    const [x2, y2] = pts[(i + 1) % points];
    return `${((x1 + x2) / 2).toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}`;
  };
  let d = `M ${mid(0)}`;
  for (let i = 1; i <= points; i++) d += ` Q ${pts[i % points][0].toFixed(1)} ${pts[i % points][1].toFixed(1)} ${mid(i)}`;
  return `${d} Z`;
}

function Splatter({ seed }: { seed: number }) {
  const splats = useMemo(() => {
    const r = rng(seed);
    // A few big splats near the edges and corners, leaving the middle readable.
    const spots = [
      [10 + r() * 12, 14 + r() * 14],
      [88 - r() * 12, 18 + r() * 20],
      [16 + r() * 14, 80 - r() * 12],
      [84 - r() * 12, 82 - r() * 10],
      [50 + (r() - 0.5) * 30, 8 + r() * 8],
    ];
    return spots.map(([x, y], i) => {
      // Each splat is a square SVG (viewBox 100) so it never stretches with the screen.
      const size = 14 + r() * 8;
      const drops = Array.from({ length: 10 }, () => {
        const a = r() * Math.PI * 2;
        const d = size * (1.15 + r() * 1.1);
        return { x: 50 + Math.cos(a) * d, y: 50 + Math.sin(a) * d, rad: 0.8 + r() * 2.4, rot: (a * 180) / Math.PI };
      });
      const drips = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({ x: 50 + (r() - 0.5) * size * 1.1, w: 1.4 + r() * 2.4, len: 12 + r() * 30 }));
      return { i, x, y, vmin: 26 + r() * 18, path: blob(r, 50, 50, size), drops, drips, delay: i * 70 + r() * 80, size };
    });
  }, [seed]);
  return (
    <div className="flair-splatter" aria-hidden>
      {splats.map((s) => (
        <svg key={s.i} className="splat" viewBox="0 0 100 100" style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.vmin}vmin`, height: `${s.vmin}vmin`, animationDelay: `${s.delay}ms` }}>
          {s.drips.map((d, j) => (
            <rect key={j} className="drip" x={d.x - d.w / 2} y={50} width={d.w} height={d.len} rx={d.w / 2} style={{ animationDelay: `${s.delay + 350}ms` }} />
          ))}
          <path d={s.path} />
          {s.drops.map((d, j) => (
            <ellipse key={j} cx={d.x} cy={d.y} rx={d.rad * 1.7} ry={d.rad} transform={`rotate(${d.rot.toFixed(0)} ${d.x.toFixed(1)} ${d.y.toFixed(1)})`} />
          ))}
        </svg>
      ))}
    </div>
  );
}

/** The skull cracks down the middle and the halves fall apart. */
function Skull() {
  const skull = (
    <>
      <path className="bone" d="M50 6 C26 6 12 22 12 44 C12 58 19 67 27 72 L27 86 C27 90 30 92 34 92 L66 92 C70 92 73 90 73 86 L73 72 C81 67 88 58 88 44 C88 22 74 6 50 6 Z" />
      <path className="socket" d="M24 46 C24 37 31 33 38 34 C44 35 46 41 45 47 C44 55 37 58 31 57 C26 56 24 51 24 46 Z" />
      <path className="socket" d="M76 46 C76 37 69 33 62 34 C56 35 54 41 55 47 C56 55 63 58 69 57 C74 56 76 51 76 46 Z" />
      <path className="socket" d="M50 58 L45 70 L55 70 Z" />
      <path className="teeth" d="M36 80 V90 M43 80 V91 M50 80 V91 M57 80 V91 M64 80 V90 M33 80 H67" />
    </>
  );
  const crack = 'M52 4 L47 18 L55 28 L46 40 L53 52 L48 62 L54 74 L49 86 L52 96';
  return (
    <svg className="flair-skull" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <clipPath id="skull-left">
          <path d={`M0 0 H52 ${crack.replace(/^M52 4/, 'L52 4')} L52 100 H0 Z`} />
        </clipPath>
        <clipPath id="skull-right">
          <path d={`M100 0 H52 ${crack.replace(/^M52 4/, 'L52 4')} L52 100 H100 Z`} />
        </clipPath>
      </defs>
      <g className="half left" clipPath="url(#skull-left)">
        {skull}
      </g>
      <g className="half right" clipPath="url(#skull-right)">
        {skull}
      </g>
      <path className="crack" d={crack} pathLength={1} />
      <path className="crack thin" d="M47 18 L38 22 L33 19 M55 28 L64 26 L70 30 M46 40 L38 43 M53 52 L61 55" pathLength={1} />
    </svg>
  );
}

function Embers({ seed }: { seed: number }) {
  const embers = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 26 }, (_, i) => ({ i, left: r() * 100, size: 3 + r() * 6, delay: r() * 2200, dur: 2200 + r() * 1800, drift: (r() - 0.5) * 120 }));
  }, [seed]);
  return (
    <div className="flair-embers" aria-hidden>
      {embers.map((e) => (
        <span key={e.i} style={{ left: `${e.left}%`, width: e.size, height: e.size, animationDelay: `${e.delay}ms`, animationDuration: `${e.dur}ms`, '--drift': `${e.drift}px` } as CSSProperties} />
      ))}
    </div>
  );
}
