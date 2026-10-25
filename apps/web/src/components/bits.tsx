import { healthDescriptor, type HitPoints } from '@dnd/core';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export function Avatar({ url, name, size = 36 }: { url?: string | null; name: string; size?: number }) {
  // Remember which URL failed, so a new picture gets a fresh try.
  const [broken, setBroken] = useState<string | null>(null);
  if (url && broken !== url) return <img className="avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setBroken(url)} />;
  return (
    <span className="avatar placeholder" style={{ width: size, height: size }}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function HpBar({ hp }: { hp: Pick<HitPoints, 'current' | 'max'> }) {
  const pct = hp.max > 0 ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : 0;
  const d = healthDescriptor(hp);
  return (
    <div className={`hpbar ${d === 'Bloodied' ? 'bloodied' : d === 'Down' ? 'down' : ''}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} style={wide ? { maxWidth: 'min(960px, calc(100vw - 32px))' } : undefined}>
      {open && (
        <>
          <div className="dialog-head">
            <strong>{title}</strong>
            <button className="ghost small" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="dialog-body">{children}</div>
        </>
      )}
    </dialog>
  );
}

// ---------- Roll toasts ----------

interface Toast {
  id: number;
  text: string;
}
const ToastCtx = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{ position: 'fixed', right: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 50 }}>
        {toasts.map((t) => (
          <div key={t.id} className="card" style={{ padding: '8px 12px', maxWidth: 360 }} role="status">
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function ago(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}
