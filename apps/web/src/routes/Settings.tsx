import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useStatus } from '../lib/hooks.ts';

export function Settings() {
  const { status } = useStatus(5000);
  const [cookie, setCookie] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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
          reads; it never changes anything on D&D Beyond. The cookie stays on this computer in <code>apps/server/data/secrets.json</code>.
        </p>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
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
          <button className="primary" disabled={!cookie || busy} onClick={save}>
            {busy ? 'Checking…' : 'Connect'}
          </button>
        </div>
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
