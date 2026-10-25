import { Link } from 'react-router-dom';
import type { DdbStatus } from '../lib/api.ts';

export function DdbStatusBanner({ status, serverDown }: { status: DdbStatus | undefined; serverDown?: boolean }) {
  if (serverDown) {
    return (
      <div className="banner bad">
        <strong>Can't reach the tracker server.</strong> Changes you make are kept in this browser and will sync when it's back.
      </div>
    );
  }
  if (!status || status === 'ok') return null;
  const text: Record<Exclude<DdbStatus, 'ok'>, string> = {
    unconfigured: "D&D Beyond isn't connected yet.",
    'auth-failed': 'D&D Beyond rejected the saved session cookie. It has probably expired.',
    unreachable: "D&D Beyond can't be reached right now. Cached monsters and last-known PC HP still work.",
  };
  return (
    <div className={status === 'auth-failed' ? 'banner bad' : 'banner'}>
      {text[status]} {status !== 'unreachable' && <Link to="/settings">Connect in Settings →</Link>}
    </div>
  );
}
