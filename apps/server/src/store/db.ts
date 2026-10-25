import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS: string[] = [
  `CREATE TABLE combats (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     archived INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE events (
     combat_id TEXT NOT NULL REFERENCES combats(id) ON DELETE CASCADE,
     seq INTEGER NOT NULL,
     event_id TEXT NOT NULL,
     ts INTEGER NOT NULL,
     body TEXT NOT NULL,
     PRIMARY KEY (combat_id, seq),
     UNIQUE (combat_id, event_id)
   );
   CREATE TABLE monster_cache (
     id INTEGER PRIMARY KEY,
     name TEXT NOT NULL,
     raw TEXT NOT NULL,
     fetched_at INTEGER NOT NULL
   );
   CREATE TABLE kv (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
  `CREATE TABLE encounters (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     doc TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
];

export type Db = DatabaseSync;

/** Open (or create) the SQLite database and apply pending migrations. `:memory:` for tests. */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    db.exec(MIGRATIONS[v]);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec('COMMIT');
  }
  return db;
}

export class Kv {
  constructor(private db: Db) {}
  get<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }
  set(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  }
  delete(key: string): void {
    this.db.prepare('DELETE FROM kv WHERE key = ?').run(key);
  }
}
