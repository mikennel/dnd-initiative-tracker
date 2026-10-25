import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useStatus } from '../lib/hooks.ts';

const inElectron = navigator.userAgent.includes('Electron');

/** Set by the Chrome connector's content script (apps/extension/connect.js). */
function connectorVersion(): string | undefined {
  return document.documentElement.dataset.ddbConnector;
}

/**
 * Ask the connector for the D&D Beyond cookie. If the user isn't logged in it opens the
 * sign-in tab once, then we poll until the cookie appears (or give up after 5 minutes).
 */
function requestCookie(onWaiting: () => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    let first = true;
    const started = Date.now();
    const ask = () => window.postMessage({ type: 'dnd-tracker/get-cobalt', openLogin: first }, location.origin);
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.data?.type !== 'dnd-tracker/cobalt') return;
      if (e.data.ok) return done(() => resolve(e.data.value));
      if (!e.data.pending) return done(() => reject(new Error(e.data.error ?? 'The extension could not read the login.')));
      if (first) onWaiting();
      first = false;
      if (Date.now() - started > 5 * 60_000) return done(() => reject(new Error('Timed out waiting for the D&D Beyond login.')));
      timer = setTimeout(ask, 2000);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (fn: () => void) => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      fn();
    };
    signal.addEventListener('abort', () => done(() => reject(new Error('Cancelled'))));
    window.addEventListener('message', onMessage);
    ask();
  });
}

export function Settings() {
  const { status } = useStatus(5000);
  const [cookie, setCookie] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [connector, setConnector] = useState(connectorVersion());
  const [params] = useSearchParams();
  const abort = useRef<AbortController | null>(null);

  // The content script runs at document_start, but check again in case it was just installed.
  useEffect(() => {
    if (connector) return;
    const t = setInterval(() => setConnector(connectorVersion()), 1000);
    return () => clearInterval(t);
  }, [connector]);

  const connectWithChrome = async () => {
    abort.current?.abort();
    const ctl = (abort.current = new AbortController());
    setBusy(true);
    setMessage(null);
    try {
      const value = await requestCookie(() => setMessage({ ok: true, text: 'Log in to D&D Beyond in the tab that just opened. This page will connect on its own.' }), ctl.signal);
      await api.setCookie(value);
      setMessage({ ok: true, text: inElectron ? 'Connected to D&D Beyond.' : 'Connected to D&D Beyond. You can close this tab.' });
    } catch (err) {
      if (!ctl.signal.aborted) setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  // The desktop app opens /settings?connect=1 in Chrome; start straight away there.
  useEffect(() => {
    if (params.get('connect') === '1' && connector && !inElectron) void connectWithChrome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector]);
  useEffect(() => () => abort.current?.abort(), []);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.setCookie(cookie);
      setCookie('');
      setMessage({ ok: true, text: 'Connected to D&D Beyond.' });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page stack">
      <h1>Settings</h1>

      <section className="card stack">
        <h2>D&D Beyond connection</h2>
        <div className="row">
          Status: <strong>{status?.ddb ?? '…'}</strong>
          {status?.ddb === 'ok' && (
            <button className="small danger" onClick={() => api.clearCookie()}>
              Disconnect
            </button>
          )}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          The tracker reads your encounters, monsters and your players' character sheets using your D&D Beyond login. It only ever
          reads; it never changes anything on D&D Beyond. The login stays on this computer.
        </p>
        {inElectron ? (
          <div className="stack">
            <div className="row">
              <button className="primary" onClick={() => window.open(`${location.origin}/settings?connect=1`)}>
                Connect with Chrome
              </button>
              <small className="muted">Opens Chrome, where you log in to D&D Beyond as usual (Google, Apple, anything).</small>
            </div>
            <small className="muted">
              Needs the tracker's Chrome extension, installed once: File → Show Chrome Extension Folder, then follow the README there.
            </small>
          </div>
        ) : connector ? (
          <div className="row">
            <button className="primary" disabled={busy} onClick={connectWithChrome}>
              {busy ? 'Waiting for D&D Beyond…' : 'Connect with Chrome'}
            </button>
            {busy && (
              <button className="small ghost" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            )}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            For one-click connecting, install the tracker's Chrome extension (<code>apps/extension</code>, see its README) and reload
            this page. Or paste the cookie by hand below.
          </p>
        )}
        <details>
          <summary className="muted">Paste the cookie by hand instead</summary>
          <ol style={{ margin: '8px 0', paddingLeft: 20 }}>
            <li>
              Open <a href="https://www.dndbeyond.com" target="_blank" rel="noreferrer">dndbeyond.com</a> in Chrome while logged in.
            </li>
            <li>
              Press <code>F12</code> → <strong>Application</strong> tab → <strong>Cookies</strong> → <code>https://www.dndbeyond.com</code>.
            </li>
            <li>
              Find <code>CobaltSession</code>, double-click its <strong>Value</strong>, and copy it.
            </li>
            <li>Paste it below. It usually lasts a few weeks; you'll see a banner when it needs refreshing.</li>
          </ol>
          <div className="row">
            <input
              className="grow"
              type="password"
              autoComplete="off"
              placeholder="CobaltSession value"
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && cookie && save()}
            />
            <button disabled={!cookie || busy} onClick={save}>
              {busy ? 'Checking…' : 'Connect'}
            </button>
          </div>
        </details>
        {message && <div className={message.ok ? 'banner' : 'banner bad'}>{message.text}</div>}
      </section>

      <section className="card stack">
        <h2>Table view on another device</h2>
        <p className="muted" style={{ margin: 0 }}>
          On a tablet or TV browser on the same Wi-Fi, open one of these. It shows whichever combat you opened last.
        </p>
        <ul className="list">
          {(status?.lanUrls ?? []).map((u) => (
            <li key={u}>
              <a href={`${u}/table`}>{u}/table</a>
            </li>
          ))}
          {status && status.lanUrls.length === 0 && <li className="muted">No network interfaces found.</li>}
        </ul>
      </section>
    </main>
  );
}
