import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Read the D&D Beyond login from the user's own Firefox profiles (ADR 0007). Firefox keeps
 * cookies unencrypted in `cookies.sqlite`, so no extension is needed. Chrome encrypts its
 * cookie store and is handled by the extension instead.
 *
 * The database is copied (with its WAL) to a temp dir first: Firefox holds it open while it
 * runs. Only the CobaltSession row is read; the copy is deleted straight away. Values are
 * never logged.
 */
export function firefoxCobaltSessions(roots = firefoxRoots()): string[] {
  const found: { value: string; lastAccessed: number }[] = [];
  for (const profile of roots.flatMap(profileDirs)) {
    const db = join(profile, 'cookies.sqlite');
    if (!existsSync(db)) continue;
    const tmp = mkdtempSync(join(tmpdir(), 'dnd-ff-'));
    try {
      copyFileSync(db, join(tmp, 'cookies.sqlite'));
      if (existsSync(`${db}-wal`)) copyFileSync(`${db}-wal`, join(tmp, 'cookies.sqlite-wal'));
      const conn = new DatabaseSync(join(tmp, 'cookies.sqlite'));
      try {
        const rows = conn
          .prepare("SELECT value, lastAccessed FROM moz_cookies WHERE name = 'CobaltSession' AND host IN ('.dndbeyond.com', 'www.dndbeyond.com', 'dndbeyond.com')")
          .all() as { value: string; lastAccessed: number }[];
        found.push(...rows.filter((r) => r.value));
      } finally {
        conn.close();
      }
    } catch {
      // Unreadable or locked profile: skip it.
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  // Most recently used first; the caller verifies each with DDB.
  return [...new Set(found.sort((a, b) => b.lastAccessed - a.lastAccessed).map((r) => r.value))];
}

export function firefoxRoots(): string[] {
  const home = homedir();
  const candidates =
    process.platform === 'win32'
      ? [join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Mozilla', 'Firefox')]
      : process.platform === 'darwin'
        ? [join(home, 'Library', 'Application Support', 'Firefox')]
        : [join(home, '.mozilla', 'firefox'), join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'), join(home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox')];
  return candidates.filter((d) => existsSync(join(d, 'profiles.ini')));
}

/** Profile directories listed in profiles.ini (`Path=`, relative unless `IsRelative=0`). */
export function profileDirs(root: string): string[] {
  const ini = readFileSync(join(root, 'profiles.ini'), 'utf8');
  const dirs: string[] = [];
  for (const section of ini.split(/^\[/m)) {
    if (!/^Profile\d+\]/.test(section)) continue;
    const path = /^Path=(.+)$/m.exec(section)?.[1]?.trim();
    if (!path) continue;
    const relative = !/^IsRelative=0$/m.test(section);
    dirs.push(relative || !isAbsolute(path) ? join(root, path) : path);
  }
  return dirs;
}
