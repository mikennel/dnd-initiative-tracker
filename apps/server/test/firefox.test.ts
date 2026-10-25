import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { firefoxCobaltSessions, profileDirs } from '../src/ddb/firefoxCookies.ts';

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));

function fakeFirefox(profiles: Record<string, { value: string; lastAccessed: number; host?: string; name?: string }[]>) {
  root = mkdtempSync(join(tmpdir(), 'ff-test-'));
  const ini = ['[General]', 'Version=2', ''];
  Object.keys(profiles).forEach((dir, i) => ini.push(`[Profile${i}]`, `Name=p${i}`, 'IsRelative=1', `Path=Profiles/${dir}`, ''));
  ini.push('[Install123]', 'Default=Profiles/x', '');
  writeFileSync(join(root, 'profiles.ini'), ini.join('\n'));
  for (const [dir, rows] of Object.entries(profiles)) {
    mkdirSync(join(root, 'Profiles', dir), { recursive: true });
    const db = new DatabaseSync(join(root, 'Profiles', dir, 'cookies.sqlite'));
    db.exec('CREATE TABLE moz_cookies (name TEXT, value TEXT, host TEXT, lastAccessed INTEGER)');
    for (const r of rows) db.prepare('INSERT INTO moz_cookies VALUES (?, ?, ?, ?)').run(r.name ?? 'CobaltSession', r.value, r.host ?? '.dndbeyond.com', r.lastAccessed);
    db.close();
  }
  return root;
}

describe('Firefox cookie import', () => {
  it('lists profiles from profiles.ini, skipping non-profile sections', () => {
    const r = fakeFirefox({ 'a.default': [], 'b.default-release': [] });
    expect(profileDirs(r).map((d) => basename(d))).toEqual(['a.default', 'b.default-release']);
  });

  it('returns CobaltSession values across profiles, most recently used first', () => {
    const r = fakeFirefox({
      'a.default': [{ value: 'older', lastAccessed: 1 }, { value: 'x', lastAccessed: 9, name: 'Other' }],
      'b.default-release': [{ value: 'newer', lastAccessed: 5 }, { value: 'evil', lastAccessed: 99, host: '.dndbeyond.com.evil.test' }],
    });
    expect(firefoxCobaltSessions([r])).toEqual(['newer', 'older']);
  });
});
