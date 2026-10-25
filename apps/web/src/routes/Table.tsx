import type { PlayerView } from '@dnd/core';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { HpBar } from '../components/bits.tsx';
import './table.css';

/**
 * Player-facing display (ADR 0005). It only ever receives the server-side `playerView`
 * projection, so hidden monsters, exact monster HP and DM notes never reach this device.
 */
export function Table() {
  const { combatId } = useParams();
  const [view, setView] = useState<PlayerView | null>(null);
  const [connected, setConnected] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws`);
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        ws!.send(JSON.stringify({ t: 'subscribe', combatId: combatId ?? 'current', role: 'table' }));
      };
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.t === 'table') {
          setView(msg.view);
          setWaiting(!msg.view);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [combatId]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [view?.combatants.find((c) => c.isActive)?.id]);

  // Keep the screen awake on tablets/TVs where supported.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as any).wakeLock?.request('screen').then((l: typeof lock) => (lock = l)).catch(() => {});
    return () => void lock?.release();
  }, []);

  if (!view) {
    return (
      <div className="table-view table-empty">
        <h1>⚔</h1>
        <p>{waiting ? 'Waiting for the DM to open a combat…' : connected ? 'Loading…' : 'Connecting to the tracker…'}</p>
      </div>
    );
  }

  const active = view.combatants.find((c) => c.isActive);
  return (
    <div className="table-view">
      <header>
        <h1>{view.name}</h1>
        <div className="table-round">{view.phase === 'active' ? <>Round {view.round}</> : view.phase === 'lineup' ? 'Initiative order' : 'Get ready…'}</div>
        <button className="ghost" onClick={() => document.documentElement.requestFullscreen?.()} title="Full screen">
          ⛶
        </button>
        {!connected && <span className="dot offline" title="Reconnecting" />}
      </header>
      {view.phase === 'lineup' && <div className="table-now">Have Alert? You can swap initiative with a willing ally. Tell the DM.</div>}
      {active && (
        <div className="table-now">
          Now: <strong>{active.name}</strong>
        </div>
      )}
      <ol className="table-list">
        {view.combatants.map((c) => (
          <li key={c.id} ref={c.isActive ? activeRef : undefined} className={[c.isActive && 'active', c.defeated && 'defeated', `k-${c.kind}`].filter(Boolean).join(' ')}>
            {view.phase === 'lineup' && <span className="t-init">{c.initiative ?? '—'}</span>}
            {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="t-avatar" /> : <span className="t-avatar placeholder">{c.name[0]}</span>}
            <div className="t-main">
              <div className="t-name">
                {c.name}
                {c.concentrating && <span className="t-chip conc">◎</span>}
              </div>
              {c.conditions.length > 0 && (
                <div className="t-conds">
                  {c.conditions.map((x) => (
                    <span key={x} className="t-chip">
                      {x}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="t-hp">
              {c.hp && (
                <>
                  <div>
                    {c.hp.current}/{c.hp.max}
                    {c.hp.temp > 0 && <span className="temp"> +{c.hp.temp}</span>}
                  </div>
                  <HpBar hp={c.hp} />
                </>
              )}
              {c.health && <span className={`t-health h-${c.health.toLowerCase()}`}>{c.health}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
